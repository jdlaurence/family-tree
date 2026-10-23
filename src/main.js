import config from "../config.js";
import { gate } from "./gate.js";
import { loadFamily, FamilyDataError, directLine } from "./data.js";
import { computeLayout } from "./layout.js";
import { renderTree } from "./tree.js";
import { createZoom } from "./zoom.js";
import { createPanel } from "./panel.js";
import { createSearch } from "./search.js";
import { formatSpan } from "./dates.js";

const $ = (sel) => document.querySelector(sel);
const isNarrow = () => window.matchMedia("(max-width: 760px)").matches;

async function boot() {
  document.title = config.siteTitle;
  $("#gate-title").textContent = config.siteTitle;
  $("#site-title").textContent = config.siteTitle;

  await gate(config, $("#gate"));

  let family;
  try {
    family = await loadFamily(config.dataFile);
  } catch (e) {
    showError(e);
    return;
  }
  if (family.title) { document.title = family.title; $("#site-title").textContent = family.title; }
  if (family.warnings.length) console.warn("family.yaml warnings:\n" + family.warnings.map(w => " • " + w.message).join("\n"));

  const svg = $("#tree");
  const viewport = $("#viewport");
  const tooltip = $("#tooltip");
  const panelEl = $("#panel");
  const app = $("#app");

  let layout;
  try {
    layout = computeLayout(family);
  } catch (e) {
    showError(new FamilyDataError([{ id: null, message: e.message }]));
    return;
  }

  const zoom = createZoom(svg, viewport);
  const tree = renderTree(viewport, family, layout, {
    onSelect: (id) => { if (!zoom.wasDrag()) select(id, { center: true }); },
    onHover: (id, g) => hover(id, g),
  });
  const panel = createPanel(panelEl, family, {
    onClose: () => select(null),
    onNavigate: (id) => select(id, { center: true }),
  });
  createSearch($("#search"), $("#search-results"), family, (id) => select(id, { center: true }));

  $("#count").textContent = `${family.list.length} ${family.list.length === 1 ? "person" : "people"}`;
  $("#zoom-in").addEventListener("click", () => zoom.zoomBy(1.4));
  $("#zoom-out").addEventListener("click", () => zoom.zoomBy(1 / 1.4));
  $("#zoom-fit").addEventListener("click", () => fitAll());
  svg.addEventListener("click", (e) => { if (!e.target.closest(".person") && !zoom.wasDrag()) select(null); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.current) select(null); });
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && family.people.has(id)) select(id, { center: true }); else if (!id) select(null, { keepHash: true }); });
  window.addEventListener("resize", () => updateInset());

  app.hidden = false;
  requestAnimationFrame(() => {
    updateInset();
    const initial = location.hash.slice(1);
    if (initial && family.people.has(initial)) {
      fitAll(false);
      select(initial, { center: true });
    } else if (config.rootPersonId && family.people.has(config.rootPersonId)) {
      fitAll(false);
      const pos = layout.positions.get(config.rootPersonId);
      zoom.centerOn(pos.x, pos.y + layout.metrics.nodeH / 2, 1, false);
    } else fitAll(false);
    showHint();
  });

  // ── behaviours ───────────────────────────────────────────────────────────────
  function fitAll(animate = true) { zoom.fit(layout.bounds, isNarrow() ? 24 : 56, animate); }

  function updateInset() {
    const header = $("#topbar").getBoundingClientRect().height;
    const open = Boolean(panel.current);
    if (isNarrow()) zoom.setInset({ top: header, right: 0, bottom: open ? Math.round(window.innerHeight * 0.5) : 0, left: 0 });
    else zoom.setInset({ top: header, right: open ? panelEl.getBoundingClientRect().width : 0, bottom: 0, left: 0 });
  }

  function select(id, { center = false, keepHash = false } = {}) {
    if (!id) {
      panel.hide();
      tree.highlight(null);
      app.classList.remove("panel-open");
      if (!keepHash && location.hash) history.replaceState(null, "", location.pathname + location.search);
      updateInset();
      return;
    }
    panel.show(id);
    app.classList.add("panel-open");
    tree.highlight(directLine(family, id), id);
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    updateInset();
    if (center) {
      // If the whole tree fits beside the panel, keep it all in view; otherwise just bring this person into view.
      if (zoom.fits(layout.bounds, isNarrow() ? 24 : 56)) fitAll();
      else {
        const pos = layout.positions.get(id);
        zoom.ensureVisible(pos.x, pos.y + layout.metrics.nodeH / 2, isNarrow() ? 90 : 140);
      }
    }
    hover(null);
  }

  function hover(id, g) {
    if (!id || panel.current === id) { tooltip.hidden = true; return; }
    const p = family.people.get(id);
    tooltip.querySelector(".tip-name").textContent = p.name;
    const span = formatSpan(p.born, p.died, p.deceased);
    const bits = [span, p.birthName ? `née ${p.birthName}` : ""].filter(Boolean).join(" · ");
    tooltip.querySelector(".tip-dates").textContent = bits;
    tooltip.querySelector(".tip-dates").hidden = !bits;
    tooltip.querySelector(".tip-tagline").textContent = p.tagline;
    tooltip.querySelector(".tip-tagline").hidden = !p.tagline;
    tooltip.hidden = false;
    const ring = g.querySelector(".ring").getBoundingClientRect();
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    let x = ring.left + ring.width / 2 - tw / 2;
    let y = ring.top - th - 12;
    if (y < 56) y = ring.bottom + 12 + 60; // below the card if there's no room above
    x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
    tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function showHint() {
    const hint = $("#hint");
    try { if (localStorage.getItem("family-tree:hinted")) return; } catch { /* ignore */ }
    hint.hidden = false;
    const done = () => { hint.classList.add("fade"); try { localStorage.setItem("family-tree:hinted", "1"); } catch { /* ignore */ } };
    setTimeout(done, 6000);
    svg.addEventListener("pointerdown", done, { once: true });
  }
}

function showError(e) {
  const box = $("#error");
  const list = box.querySelector("ul");
  list.textContent = "";
  const problems = e instanceof FamilyDataError ? e.problems : [{ message: e.message || String(e) }];
  for (const p of problems) { const li = document.createElement("li"); li.textContent = p.message; list.appendChild(li); }
  box.hidden = false;
  console.error(e);
}

boot();
