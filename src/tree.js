// Renders the family as SVG: connectors, couple lines and person cards.
import { formatSpan, formatLong } from "./dates.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent = null) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};

export function renderTree(viewport, family, layout, handlers = {}) {
  const M = layout.metrics;
  const R = M.photoR;
  viewport.textContent = "";

  const defs = el("defs", {}, viewport);
  const gLinks = el("g", { class: "links" }, viewport);
  const gCouples = el("g", { class: "couples" }, viewport);
  const gNodes = el("g", { class: "nodes" }, viewport);

  const linkEls = []; // { el, union, child }
  const coupleEls = []; // { el, union }
  const nodeEls = new Map(); // id → g

  // ── Connectors: union → children ─────────────────────────────────────────────
  const r = 14; // corner radius
  for (const u of layout.unions) {
    if (!u.children.length) continue;
    const stem = el("path", { class: "link stem", d: `M${u.x} ${u.dropFrom} V${u.busY}` }, gLinks);
    linkEls.push({ el: stem, union: u, child: null });
    for (const cid of u.children) {
      const cx = layout.positions.get(cid).x;
      const dx = cx - u.x;
      let d;
      if (Math.abs(dx) < r + 1) d = `M${u.x} ${u.busY} V${u.childTop}`;
      else {
        const dir = Math.sign(dx);
        d = `M${u.x} ${u.busY} H${cx - dir * r} Q${cx} ${u.busY} ${cx} ${u.busY + r} V${u.childTop}`;
      }
      const path = el("path", { class: "link drop", d }, gLinks);
      linkEls.push({ el: path, union: u, child: cid });
    }
  }

  // ── Couple lines ─────────────────────────────────────────────────────────────
  for (const u of layout.unions) {
    if (!u.couple) continue;
    const g = el("g", { class: "couple" + (u.divorced ? " divorced" : "") }, gCouples);
    el("line", { x1: u.x1, y1: u.lineY, x2: u.x2, y2: u.lineY }, g);
    el("circle", { cx: u.x, cy: u.lineY, r: 3.2, class: "knot" }, g);
    coupleEls.push({ el: g, union: u });
  }

  // ── People ───────────────────────────────────────────────────────────────────
  for (const p of family.list) {
    const pos = layout.positions.get(p.id);
    const g = el("g", { class: "person" + (p.deceased ? " deceased" : ""), "data-id": p.id, transform: `translate(${pos.x} ${pos.y})`, tabindex: 0, role: "button" }, gNodes);
    el("title", {}, g).textContent = p.name;
    el("circle", { class: "halo", cx: 0, cy: R, r: R + 7 }, g);
    el("circle", { class: "ring", cx: 0, cy: R, r: R }, g);
    if (p.photo) {
      const clip = el("clipPath", { id: `clip-${p.id}` }, defs);
      el("circle", { cx: 0, cy: R, r: R - 2.5 }, clip);
      const img = el("image", {
        href: `photos/${encodeURIComponent(p.photo)}`, x: -(R - 2.5), y: 2.5, width: 2 * R - 5, height: 2 * R - 5,
        preserveAspectRatio: "xMidYMid slice", "clip-path": `url(#clip-${p.id})`,
      }, g);
      img.addEventListener("error", () => { img.remove(); placeholder(g, p, R); }, { once: true });
    } else placeholder(g, p, R);

    const lines = wrapName(p.displayName);
    const name = el("text", { class: "name", x: 0, y: 2 * R + 24, "text-anchor": "middle" }, g);
    lines.forEach((line, i) => { el("tspan", { x: 0, dy: i === 0 ? 0 : 19 }, name).textContent = line; });
    const span = formatSpan(p.born, p.died, p.deceased);
    if (span) el("text", { class: "dates", x: 0, y: 2 * R + 24 + 19 * (lines.length - 1) + 20, "text-anchor": "middle" }, g).textContent = span;

    // Interaction
    const hit = el("rect", { class: "hit", x: -M.nodeW / 2, y: -8, width: M.nodeW, height: M.nodeH + 8, fill: "transparent" }, g);
    g.insertBefore(hit, g.firstChild);
    g.addEventListener("click", (e) => { e.stopPropagation(); handlers.onSelect?.(p.id, g); });
    g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlers.onSelect?.(p.id, g); } });
    g.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") handlers.onHover?.(p.id, g); });
    g.addEventListener("pointerleave", () => handlers.onHover?.(null, null));
    g.addEventListener("focus", () => handlers.onHover?.(p.id, g));
    g.addEventListener("blur", () => handlers.onHover?.(null, null));
    nodeEls.set(p.id, g);
  }

  function placeholder(g, p, R) {
    const ph = el("g", { class: "placeholder" + (p.gender ? ` gender-${p.gender}` : "") });
    el("circle", { cx: 0, cy: R, r: R - 2.5 }, ph);
    el("text", { class: "initials", x: 0, y: R + 1, "text-anchor": "middle", "dominant-baseline": "central" }, ph).textContent = initials(p);
    g.insertBefore(ph, g.querySelector(".name"));
  }

  /** Dim everyone outside a set of ids (null = clear). */
  function highlight(ids, selectedId = null) {
    for (const [id, g] of nodeEls) {
      g.classList.toggle("dim", ids ? !ids.has(id) : false);
      g.classList.toggle("selected", id === selectedId);
    }
    for (const { el: path, union, child } of linkEls) {
      let lit = true;
      if (ids) {
        const partnerLit = union.partners.some(pid => ids.has(pid));
        lit = child ? partnerLit && ids.has(child) : partnerLit && union.children.some(c => ids.has(c));
      }
      path.classList.toggle("dim", !lit);
    }
    for (const { el: g, union } of coupleEls) {
      g.classList.toggle("dim", ids ? !union.partners.some(pid => ids.has(pid)) : false);
    }
  }

  return { nodeEls, highlight };
}

function initials(p) {
  const words = p.name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** Split a display name into at most two lines so it fits the card. */
function wrapName(name) {
  if (name.length <= 15 || !name.includes(" ")) return [name];
  const words = name.split(" ");
  let best = null, bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const score = Math.abs(a.length - b.length) + Math.max(a.length, b.length) * 0.5;
    if (score < bestScore) { bestScore = score; best = [a, b]; }
  }
  return best;
}

/** Tooltip text helper shared with the panel. */
export function lifeLine(p) {
  const parts = [];
  if (p.born) parts.push(`Born ${formatLong(p.born)}${p.bornPlace ? ", " + p.bornPlace : ""}`);
  if (p.died) parts.push(`Died ${formatLong(p.died)}${p.diedPlace ? ", " + p.diedPlace : ""}`);
  else if (p.deceased) parts.push("Deceased");
  return parts.join(" · ");
}
