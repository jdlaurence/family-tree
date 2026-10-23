// Name search with a dropdown of matches. ⌘K / Ctrl+K focuses it.
import { formatSpan } from "./dates.js";

export function createSearch(input, listEl, family, onPick) {
  let results = [];
  let active = -1;

  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const haystack = family.list.map(p => ({
    p, text: normalize([p.name, p.nickname, p.birthName, p.displayName, p.id.replace(/-/g, " ")].filter(Boolean).join(" ")),
  }));

  function query(q) {
    const nq = normalize(q.trim());
    if (!nq) { results = []; render(); return; }
    const terms = nq.split(/\s+/);
    results = haystack
      .filter(h => terms.every(t => h.text.includes(t)))
      .sort((a, b) => a.p.index - b.p.index)
      .slice(0, 8)
      .map(h => h.p);
    active = results.length ? 0 : -1;
    render();
  }

  function render() {
    listEl.textContent = "";
    listEl.hidden = results.length === 0;
    results.forEach((p, i) => {
      const li = document.createElement("li");
      li.className = "search-item" + (i === active ? " active" : "");
      li.setAttribute("role", "option");
      const name = document.createElement("span"); name.className = "search-name"; name.textContent = p.name;
      const span = document.createElement("span"); span.className = "search-dates"; span.textContent = formatSpan(p.born, p.died, p.deceased);
      li.append(name, span);
      li.addEventListener("pointerdown", (e) => { e.preventDefault(); pick(i); });
      listEl.appendChild(li);
    });
  }

  function pick(i) {
    const p = results[i];
    if (!p) return;
    input.value = "";
    results = []; render();
    input.blur();
    onPick(p.id);
  }

  input.addEventListener("input", () => query(input.value));
  input.addEventListener("focus", () => query(input.value));
  input.addEventListener("blur", () => setTimeout(() => { results = []; render(); }, 120));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) { active = (active + 1) % results.length; render(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) { active = (active - 1 + results.length) % results.length; render(); } }
    else if (e.key === "Enter") { e.preventDefault(); pick(active); }
    else if (e.key === "Escape") { input.value = ""; results = []; render(); input.blur(); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.focus(); input.select(); }
    else if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) { e.preventDefault(); input.focus(); }
  });
}
