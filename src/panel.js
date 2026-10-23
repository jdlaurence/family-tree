// The side panel (desktop) / bottom sheet (mobile) showing one person in full.
import { marked } from "../vendor/marked.mjs";
import { formatLong, formatYear, ageBetween } from "./dates.js";

marked.setOptions({ breaks: true, gfm: true });

export function createPanel(root, family, handlers = {}) {
  const scroll = root.querySelector(".panel-scroll");
  const closeBtn = root.querySelector(".panel-close");
  let current = null;

  closeBtn.addEventListener("click", () => handlers.onClose?.());
  root.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-goto]");
    if (chip) { e.preventDefault(); handlers.onNavigate?.(chip.dataset.goto); }
  });

  function show(id) {
    const p = family.people.get(id);
    if (!p) return;
    current = id;
    scroll.textContent = "";
    scroll.appendChild(buildHead(p));
    scroll.appendChild(buildKin(p));
    const hasContent = p.bio.trim() || p.facts.length || p.stories.length;
    if (p.bio.trim()) scroll.appendChild(section("About", md(p.bio), "panel-bio"));
    if (p.facts.length) {
      const ul = h("ul", "panel-facts-list");
      for (const f of p.facts) ul.appendChild(h("li", null, md(f, true)));
      scroll.appendChild(section(p.facts.length === 1 ? "Fun fact" : "Fun facts", ul, "panel-facts"));
    }
    if (p.stories.length) {
      const wrap = h("div");
      for (const st of p.stories) {
        const art = h("article", "story");
        if (st.title) art.appendChild(h("h4", "story-title", st.title));
        art.appendChild(md(st.text));
        const meta = [st.told_by ? `As told by ${st.told_by}` : "", st.date ? formatLong(st.date) : (st.dateRaw ?? "")].filter(Boolean).join(" · ");
        if (meta) art.appendChild(h("p", "story-meta", meta));
        wrap.appendChild(art);
      }
      scroll.appendChild(section(p.stories.length === 1 ? "A story" : "Stories", wrap, "panel-stories"));
    }
    if (!hasContent) {
      const empty = h("p", "panel-empty");
      empty.append("Nothing recorded yet. Add a ", h("code", null, "bio"), ", ", h("code", null, "facts"), " or ", h("code", null, "stories"), " under ");
      empty.append(h("code", null, `id: ${p.id}`), " in family.yaml.");
      scroll.appendChild(empty);
    }
    root.hidden = false;
    root.classList.add("open");
    scroll.scrollTop = 0;
  }

  function hide() {
    current = null;
    root.classList.remove("open");
    root.hidden = true;
  }

  function buildHead(p) {
    const head = h("header", "panel-head");
    const photo = h("div", "panel-photo" + (p.deceased ? " deceased" : ""));
    if (p.photo) {
      const img = h("img");
      img.src = `photos/${encodeURIComponent(p.photo)}`;
      img.alt = p.name;
      img.addEventListener("error", () => { img.remove(); photo.textContent = initials(p); photo.classList.add("placeholder"); }, { once: true });
      photo.appendChild(img);
    } else { photo.textContent = initials(p); photo.classList.add("placeholder"); }
    head.appendChild(photo);
    head.appendChild(h("h2", "panel-name", p.name));
    const sub = [];
    if (p.nickname) sub.push(`“${p.nickname}”`);
    if (p.birthName) sub.push(`née ${p.birthName}`);
    if (sub.length) head.appendChild(h("p", "panel-sub", sub.join("  ·  ")));

    const dates = h("div", "panel-dates");
    if (p.born) {
      const row = h("div", "date-row");
      row.appendChild(h("span", "date-label", "Born"));
      row.appendChild(h("span", "date-value", formatLong(p.born) + (p.bornPlace ? `, ${p.bornPlace}` : "")));
      dates.appendChild(row);
    }
    if (p.died || p.deceased) {
      const row = h("div", "date-row");
      row.appendChild(h("span", "date-label", "Died"));
      let v = p.died ? formatLong(p.died) : "date unknown";
      if (p.diedPlace) v += `, ${p.diedPlace}`;
      const age = p.died ? ageBetween(p.born, p.died) : null;
      if (age && age.years >= 0) v += `  (aged ${age.approx ? "about " : ""}${age.years})`;
      row.appendChild(h("span", "date-value", v));
      dates.appendChild(row);
    } else if (p.born) {
      const age = ageBetween(p.born);
      if (age && age.years >= 0) {
        const row = h("div", "date-row");
        row.appendChild(h("span", "date-label", "Age"));
        row.appendChild(h("span", "date-value", `${age.approx ? "about " : ""}${age.years}`));
        dates.appendChild(row);
      }
    }
    if (dates.childElementCount) head.appendChild(dates);
    if (p.tagline) head.appendChild(h("p", "panel-tagline", p.tagline));
    return head;
  }

  function buildKin(p) {
    const kin = h("section", "panel-kin");
    const row = (label, ids, extra) => {
      if (!ids.length) return;
      const r = h("div", "kin-row");
      r.appendChild(h("span", "kin-label", label));
      const chips = h("div", "kin-chips");
      ids.forEach((id, i) => {
        const other = family.people.get(id);
        const chip = h("a", "chip", other.displayName);
        chip.href = `#${id}`;
        chip.dataset.goto = id;
        chip.title = other.name;
        if (extra && extra[i]) chip.appendChild(h("span", "chip-note", extra[i]));
        chips.appendChild(chip);
      });
      r.appendChild(chips);
      kin.appendChild(r);
    };
    row(p.parents.length === 1 ? "Parent" : "Parents", p.parents);
    const spouseNotes = p.spouses.map(s => {
      const bits = [];
      if (s.married) bits.push(`m. ${formatYear(s.married)}`);
      if (s.divorced) bits.push(`div. ${formatYear(s.divorced)}`);
      return bits.join(", ");
    });
    row(p.spouses.length === 1 ? "Spouse" : "Spouses", p.spouses.map(s => s.id), spouseNotes);
    row(p.children.length === 1 ? "Child" : "Children", p.children);
    row(p.siblings.length === 1 ? "Sibling" : "Siblings", p.siblings);
    return kin;
  }

  return { show, hide, get current() { return current; } };
}

function section(title, body, cls) {
  const s = h("section", cls);
  s.appendChild(h("h3", "panel-h", title));
  s.appendChild(body);
  return s;
}

function md(text, inline = false) {
  const div = h("div", "prose");
  div.innerHTML = inline ? marked.parseInline(text) : marked.parse(text);
  return div;
}

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}

function initials(p) {
  const words = p.name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}
