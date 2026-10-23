// Load, validate and normalize family.yaml into a graph the layout and renderer can use.
import yaml from "../vendor/js-yaml.mjs";
import { parseDate, sortKey } from "./dates.js";

export class FamilyDataError extends Error {
  constructor(problems) {
    super(problems.map(p => p.message).join("\n"));
    this.name = "FamilyDataError";
    this.problems = problems; // [{ id, message }]
  }
}

const ALLOWED_PERSON_KEYS = new Set([
  "id", "name", "birth_name", "nickname", "short_name", "gender", "born", "died", "deceased",
  "born_place", "died_place", "photo", "parents", "spouses", "tagline", "bio", "facts", "stories",
]);

/** Fetch and parse the YAML file. Throws FamilyDataError with readable problems. */
export async function loadFamily(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new FamilyDataError([{ id: null, message: `Could not load ${url} (HTTP ${res.status}).` }]);
  return parseFamily(await res.text());
}

/** Pure: YAML text → normalized family. Used by the browser and by scripts/validate.mjs. */
export function parseFamily(text) {
  let doc;
  try {
    doc = yaml.load(text);
  } catch (e) {
    const where = e.mark ? ` (line ${e.mark.line + 1}, column ${e.mark.column + 1})` : "";
    throw new FamilyDataError([{ id: null, message: `The YAML could not be read${where}: ${e.reason || e.message}` }]);
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.people)) {
    throw new FamilyDataError([{ id: null, message: 'The file must have a top-level "people:" list.' }]);
  }
  return normalize(doc);
}

function normalize(doc) {
  const errors = [];
  const warnings = [];
  const people = new Map();
  const list = [];

  // Pass 1: people
  doc.people.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      errors.push({ id: null, message: `Person #${index + 1} is not a block of fields.` });
      return;
    }
    const id = raw.id != null ? String(raw.id).trim() : "";
    const label = id || raw.name || `person #${index + 1}`;
    if (!id) errors.push({ id: null, message: `${label}: every person needs an "id".` });
    else if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push({ id, message: `${id}: ids must be lowercase letters, numbers and hyphens (e.g. "lois-laurence").` });
    if (people.has(id)) { errors.push({ id, message: `${id}: this id is used twice.` }); return; }
    if (!raw.name || !String(raw.name).trim()) errors.push({ id, message: `${label}: every person needs a "name".` });

    for (const key of Object.keys(raw)) {
      if (!ALLOWED_PERSON_KEYS.has(key)) warnings.push({ id, message: `${label}: unknown field "${key}" is ignored.` });
    }

    const born = parseDate(raw.born);
    const died = parseDate(raw.died);
    if (born?.invalid) errors.push({ id, message: `${label}: can't read born date "${born.raw}". Use 1965, 1965-03, 1965-03-12 or "c. 1932".` });
    if (died?.invalid) errors.push({ id, message: `${label}: can't read died date "${died.raw}". Use 1965, 1965-03, 1965-03-12 or "c. 1932".` });

    const parents = raw.parents == null ? [] : Array.isArray(raw.parents) ? raw.parents.map(String) : [String(raw.parents)];
    if (parents.length > 2) errors.push({ id, message: `${label}: a person can have at most two parents listed.` });

    const spouses = [];
    if (raw.spouses != null) {
      const arr = Array.isArray(raw.spouses) ? raw.spouses : [raw.spouses];
      for (const s of arr) {
        if (typeof s === "string") spouses.push({ id: s });
        else if (s && typeof s === "object" && s.id) {
          const entry = { id: String(s.id) };
          for (const k of ["married", "divorced", "widowed"]) {
            if (s[k] != null && s[k] !== "") {
              const d = parseDate(s[k]);
              if (d?.invalid) errors.push({ id, message: `${label}: can't read ${k} date "${d.raw}" for spouse ${s.id}.` });
              else entry[k] = d;
            }
          }
          spouses.push(entry);
        } else errors.push({ id, message: `${label}: each spouse needs an "id".` });
      }
    }

    const stories = [];
    if (raw.stories != null) {
      const arr = Array.isArray(raw.stories) ? raw.stories : [raw.stories];
      arr.forEach((st, i) => {
        if (typeof st === "string") stories.push({ title: "", text: st });
        else if (st && typeof st === "object") {
          const date = parseDate(st.date);
          if (date?.invalid) warnings.push({ id, message: `${label}: story #${i + 1} has an unreadable date "${date.raw}".` });
          stories.push({ title: st.title ? String(st.title) : "", told_by: st.told_by ? String(st.told_by) : "", date: date?.invalid ? null : date, dateRaw: st.date, text: st.text ? String(st.text) : "" });
        }
      });
    }

    const person = {
      id, index,
      name: String(raw.name ?? "").trim(),
      birthName: raw.birth_name ? String(raw.birth_name).trim() : "",
      nickname: raw.nickname ? String(raw.nickname).trim() : "",
      shortName: raw.short_name ? String(raw.short_name).trim() : "",
      gender: raw.gender ? String(raw.gender).trim().toLowerCase() : "",
      born: born?.invalid ? null : born,
      died: died?.invalid ? null : died,
      deceased: Boolean(raw.deceased) || Boolean(died && !died.invalid),
      bornPlace: raw.born_place ? String(raw.born_place).trim() : "",
      diedPlace: raw.died_place ? String(raw.died_place).trim() : "",
      photo: raw.photo ? String(raw.photo).trim() : "",
      parents, spouses,
      tagline: raw.tagline ? String(raw.tagline).trim() : "",
      bio: raw.bio ? String(raw.bio) : "",
      facts: raw.facts == null ? [] : (Array.isArray(raw.facts) ? raw.facts : [raw.facts]).map(String),
      stories,
      // derived
      children: [], siblings: [], unions: [],
    };
    person.displayName = computeDisplayName(person);
    if (id) { people.set(id, person); list.push(person); }
  });

  // Pass 2: references
  for (const p of list) {
    p.parents = p.parents.filter(pid => {
      if (!people.has(pid)) { errors.push({ id: p.id, message: `${p.id}: parent "${pid}" doesn't match any person's id.` }); return false; }
      if (pid === p.id) { errors.push({ id: p.id, message: `${p.id}: is listed as their own parent.` }); return false; }
      return true;
    });
    p.spouses = p.spouses.filter(s => {
      if (!people.has(s.id)) { errors.push({ id: p.id, message: `${p.id}: spouse "${s.id}" doesn't match any person's id.` }); return false; }
      if (s.id === p.id) { errors.push({ id: p.id, message: `${p.id}: is listed as their own spouse.` }); return false; }
      return true;
    });
  }
  if (errors.length) throw new FamilyDataError(errors);

  // Mirror spouse links so both partners know about each other.
  for (const p of list) {
    for (const s of p.spouses) {
      const other = people.get(s.id);
      let back = other.spouses.find(x => x.id === p.id);
      if (!back) { back = { id: p.id }; other.spouses.push(back); }
      for (const k of ["married", "divorced", "widowed"]) {
        if (s[k] && !back[k]) back[k] = s[k];
        if (back[k] && !s[k]) s[k] = back[k];
      }
    }
  }

  // Unions: a couple (or single parent) plus their children.
  const unions = new Map();
  const unionFor = (ids) => {
    const key = [...ids].sort().join("+");
    let u = unions.get(key);
    if (!u) {
      u = { id: key, partners: [...ids].sort((a, b) => people.get(a).index - people.get(b).index), children: [], married: null, divorced: null, widowed: null };
      unions.set(key, u);
      for (const pid of u.partners) people.get(pid).unions.push(u);
    }
    return u;
  };
  for (const p of list) {
    for (const s of p.spouses) {
      const u = unionFor([p.id, s.id]);
      u.married = u.married || s.married || null;
      u.divorced = u.divorced || s.divorced || null;
      u.widowed = u.widowed || s.widowed || null;
    }
  }
  for (const p of list) {
    if (p.parents.length) {
      const u = unionFor(p.parents);
      u.children.push(p.id);
      for (const pid of p.parents) people.get(pid).children.push(p.id);
    }
  }
  // Order children by birth, then by file order.
  const byBirth = (a, b) => sortKey(people.get(a).born) - sortKey(people.get(b).born) || people.get(a).index - people.get(b).index;
  for (const u of unions.values()) u.children.sort(byBirth);
  for (const p of list) {
    p.children = [...new Set(p.children)].sort(byBirth);
    const sibs = new Set();
    for (const pid of p.parents) for (const c of people.get(pid).children) if (c !== p.id) sibs.add(c);
    p.siblings = [...sibs].sort(byBirth);
    // Put the "main" union first for a person with several.
    p.unions.sort((a, b) => sortKey(a.married) - sortKey(b.married));
  }

  // Loud but harmless warnings.
  for (const p of list) {
    if (p.born && p.died && sortKey(p.died) < sortKey(p.born)) warnings.push({ id: p.id, message: `${p.id}: died before being born?` });
    for (const pid of p.parents) {
      const par = people.get(pid);
      if (par.born && p.born && par.born.year >= p.born.year) warnings.push({ id: p.id, message: `${p.id}: parent ${pid} was born in ${par.born.year}, the same year or later.` });
    }
  }

  return {
    title: doc.title ? String(doc.title) : "",
    people, list,
    unions: [...unions.values()],
    warnings,
  };
}

/** Short name printed on the tree: nickname or first name, plus last word of the full name. */
function computeDisplayName(p) {
  if (p.shortName) return p.shortName;
  const words = p.name.replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return p.nickname || p.id;
  const last = words[words.length - 1];
  const first = p.nickname || words[0];
  return words.length === 1 ? words[0] : `${first} ${last}`;
}

/** Ancestors, descendants and spouses of a person — the "direct line" highlighted on selection. */
export function directLine(family, id) {
  const set = new Set([id]);
  const up = [id];
  while (up.length) {
    const p = family.people.get(up.pop());
    for (const pid of p.parents) if (!set.has(pid)) { set.add(pid); up.push(pid); }
  }
  const down = [id];
  while (down.length) {
    const p = family.people.get(down.pop());
    for (const cid of p.children) if (!set.has(cid)) { set.add(cid); down.push(cid); }
  }
  for (const s of family.people.get(id).spouses) set.add(s.id);
  return set;
}
