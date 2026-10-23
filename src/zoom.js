// Pan & zoom for the SVG canvas: drag, wheel, pinch, plus animated fit/center.
// Transform model: screen = translate(tx, ty) · scale(k) · world.

export function createZoom(svg, viewport, opts = {}) {
  const minK = opts.minK ?? 0.15;
  const maxK = opts.maxK ?? 2.5;
  let tx = 0, ty = 0, k = 1;
  let inset = { top: 0, right: 0, bottom: 0, left: 0 }; // UI covering the canvas (panel, header)
  let anim = null;
  let dragged = false;

  const apply = () => { viewport.setAttribute("transform", `translate(${tx} ${ty}) scale(${k})`); };
  const size = () => ({ w: svg.clientWidth, h: svg.clientHeight });
  const visible = () => {
    const { w, h } = size();
    return { x: inset.left, y: inset.top, w: Math.max(100, w - inset.left - inset.right), h: Math.max(100, h - inset.top - inset.bottom) };
  };
  const clampK = (v) => Math.min(maxK, Math.max(minK, v));

  function zoomAt(factor, sx, sy) {
    const nk = clampK(k * factor);
    const f = nk / k;
    tx = sx - (sx - tx) * f;
    ty = sy - (sy - ty) * f;
    k = nk;
    apply();
  }

  function animateTo(target, duration = 500) {
    if (anim) cancelAnimationFrame(anim);
    const from = { tx, ty, k };
    const start = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = ease(t);
      tx = from.tx + (target.tx - from.tx) * e;
      ty = from.ty + (target.ty - from.ty) * e;
      k = from.k + (target.k - from.k) * e;
      apply();
      if (t < 1) anim = requestAnimationFrame(step); else anim = null;
    };
    anim = requestAnimationFrame(step);
  }

  /** Fit a world-space box into the visible area. */
  function fit(bounds, padding = 48, animate = true) {
    const v = visible();
    const nk = clampK(Math.min((v.w - 2 * padding) / bounds.width, (v.h - 2 * padding) / bounds.height, 1));
    const target = {
      k: nk,
      tx: v.x + v.w / 2 - nk * (bounds.x + bounds.width / 2),
      ty: v.y + v.h / 2 - nk * (bounds.y + bounds.height / 2),
    };
    if (animate) animateTo(target); else { ({ tx, ty, k } = target); apply(); }
  }

  /** Would this box fit in the visible area at (roughly) the current scale? */
  function fits(bounds, padding = 48) {
    const v = visible();
    const nk = Math.min((v.w - 2 * padding) / bounds.width, (v.h - 2 * padding) / bounds.height, 1);
    return nk >= k * 0.85;
  }

  /** Center a world point in the visible area, optionally changing zoom. */
  function centerOn(wx, wy, targetK = null, animate = true) {
    const v = visible();
    const nk = targetK == null ? k : clampK(targetK);
    const target = { k: nk, tx: v.x + v.w / 2 - nk * wx, ty: v.y + v.h / 2 - nk * wy };
    if (animate) animateTo(target); else { ({ tx, ty, k } = target); apply(); }
  }

  /** Pan the minimum amount needed to bring a world point into the visible area (with margin). */
  function ensureVisible(wx, wy, margin = 120, animate = true) {
    const v = visible();
    const sx = tx + k * wx, sy = ty + k * wy;
    let dx = 0, dy = 0;
    if (sx < v.x + margin) dx = v.x + margin - sx;
    else if (sx > v.x + v.w - margin) dx = v.x + v.w - margin - sx;
    if (sy < v.y + margin) dy = v.y + margin - sy;
    else if (sy > v.y + v.h - margin) dy = v.y + v.h - margin - sy;
    if (!dx && !dy) return;
    const target = { k, tx: tx + dx, ty: ty + dy };
    if (animate) animateTo(target, 400); else { ({ tx, ty } = target); apply(); }
  }

  // ── Pointer handling ─────────────────────────────────────────────────────────
  const pointers = new Map();
  let last = null; // {x, y, dist}
  let moved = 0;

  // No pointer capture: capturing would retarget pointerup to the svg and swallow clicks on people.
  const onMove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = centroid();
    if (!last) { last = now; return; }
    const dx = now.x - last.x, dy = now.y - last.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > 4) dragged = true;
    if (pointers.size >= 2 && last.dist > 0 && now.dist > 0) {
      const rect = svg.getBoundingClientRect();
      zoomAt(now.dist / last.dist, now.x - rect.left, now.y - rect.top);
    }
    tx += dx; ty += dy;
    apply();
    last = now;
  };
  const onEnd = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    last = pointers.size ? centroid() : null;
    if (!pointers.size) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    }
  };
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (!pointers.size) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onEnd);
      window.addEventListener("pointercancel", onEnd);
      moved = 0;
      dragged = false;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last = centroid();
    if (anim) { cancelAnimationFrame(anim); anim = null; }
  });

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    // Trackpad pinch arrives as ctrlKey+wheel; plain wheel scrolls → zoom gently.
    const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
    zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });

  svg.addEventListener("dblclick", (e) => {
    if (e.target.closest(".person")) return;
    const rect = svg.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const nk = clampK(k * 1.6);
    animateTo({ k: nk, tx: sx - (sx - tx) * (nk / k), ty: sy - (sy - ty) * (nk / k) }, 350);
  });

  function centroid() {
    const pts = [...pointers.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    return { x, y, dist };
  }

  apply();
  return {
    fit, fits, centerOn, ensureVisible,
    zoomBy(factor) {
      const v = visible();
      const sx = v.x + v.w / 2, sy = v.y + v.h / 2;
      const nk = clampK(k * factor);
      animateTo({ k: nk, tx: sx - (sx - tx) * (nk / k), ty: sy - (sy - ty) * (nk / k) }, 300);
    },
    setInset(next) { inset = { ...inset, ...next }; },
    get scale() { return k; },
    /** True if the last pointer gesture was a drag (so a following click should be ignored). */
    wasDrag() { return dragged; },
  };
}
