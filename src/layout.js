// Generation-layered family tree layout.
// Input: the normalized family from data.js. Output: x/y for every person plus union geometry.
//
// 1. Assign a generation to everyone (spouses share one; children are one below their parents).
// 2. Group each generation into "units": a couple side by side, or a single person.
// 3. Order units with a few barycenter sweeps so parents sit above their children.
// 4. Assign x coordinates with isotonic regression (keeps order + minimum gaps while
//    centering parents over children and children under parents).

export const METRICS = Object.freeze({
  nodeW: 132,     // horizontal room per person (name text width)
  nodeH: 148,     // photo + name + dates
  photoR: 36,
  coupleGap: 40,  // space between two partners' cards
  unitGap: 44,    // space between unrelated neighbours
  layerH: 236,    // vertical distance between generations
});

export function computeLayout(family, metrics = METRICS) {
  const { people, list, unions } = family;
  const M = metrics;
  if (list.length === 0) return { positions: new Map(), unions: [], bounds: { x: 0, y: 0, width: 0, height: 0 }, layers: [] };

  // ── 1. Generations ───────────────────────────────────────────────────────────
  const gen = new Map(list.map(p => [p.id, 0]));
  let changed = true, guard = 0;
  while (changed) {
    if (++guard > 500) throw new Error("The family data contains an impossible loop (someone is their own ancestor).");
    changed = false;
    for (const u of unions) {
      let g = Math.max(...u.partners.map(id => gen.get(id)));
      for (const id of u.partners) if (gen.get(id) !== g) { gen.set(id, g); changed = true; }
      for (const c of u.children) if (gen.get(c) < g + 1) { gen.set(c, g + 1); changed = true; }
    }
  }
  const maxGen = Math.max(...gen.values());

  // ── 2. Units per layer ───────────────────────────────────────────────────────
  const spouseAdj = new Map(list.map(p => [p.id, []]));
  for (const u of unions) if (u.partners.length === 2) {
    const [a, b] = u.partners;
    spouseAdj.get(a).push(b);
    spouseAdj.get(b).push(a);
  }
  const unitOf = new Map();
  const layers = [];
  for (let g = 0; g <= maxGen; g++) {
    const ids = list.filter(p => gen.get(p.id) === g).map(p => p.id);
    const seen = new Set();
    const units = [];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const comp = [];
      const stack = [id];
      seen.add(id);
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        for (const n of spouseAdj.get(cur)) if (!seen.has(n) && gen.get(n) === g) { seen.add(n); stack.push(n); }
      }
      const unit = { members: chainOrder(comp, spouseAdj, people), x: 0, width: 0, layer: g };
      unit.width = unit.members.length * M.nodeW + (unit.members.length - 1) * M.coupleGap;
      for (const m of unit.members) unitOf.set(m, unit);
      units.push(unit);
    }
    units.sort((a, b) => minIndex(a, people) - minIndex(b, people));
    layers.push(units);
  }

  // ── Helpers for coordinates ──────────────────────────────────────────────────
  const personX = new Map(); // center x of each person
  const refreshPersonX = (units) => {
    for (const u of units) u.members.forEach((m, i) => personX.set(m, u.x + M.nodeW / 2 + i * (M.nodeW + M.coupleGap)));
  };
  const unitCenter = (u) => u.x + u.width / 2;
  const memberOffset = (u, i) => (M.nodeW / 2 + i * (M.nodeW + M.coupleGap)) - u.width / 2; // member center relative to unit center
  const unionMid = (u) => u.partners.reduce((s, id) => s + personX.get(id), 0) / u.partners.length;

  const packLayer = (units) => {
    let x = 0;
    for (const u of units) { u.x = x; x += u.width + M.unitGap; }
    refreshPersonX(units);
  };
  layers.forEach(packLayer);

  // Desired center of a unit from its members' parents (top-down).
  const desiredFromParents = (u) => {
    const votes = [];
    u.members.forEach((m, i) => {
      const parents = people.get(m).parents;
      if (!parents.length) return;
      const target = parents.reduce((s, pid) => s + personX.get(pid), 0) / parents.length;
      votes.push(target - memberOffset(u, i));
    });
    return votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
  };
  // Desired center of a unit from its unions' children (bottom-up).
  const desiredFromChildren = (u) => {
    const votes = [];
    const unitUnions = new Set();
    for (const m of u.members) for (const un of people.get(m).unions) if (un.children.length) unitUnions.add(un);
    for (const un of unitUnions) {
      const xs = un.children.map(c => personX.get(c));
      const target = (Math.min(...xs) + Math.max(...xs)) / 2;
      votes.push(target - (unionMid(un) - unitCenter(u)));
    }
    return votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
  };

  // ── 3. Ordering sweeps ───────────────────────────────────────────────────────
  // Units with an anchor (parents above / children below) are sorted by the barycenter
  // of those anchors. Units without one travel with the anchored unit to their left,
  // so an orphan branch or a childless sibling keeps its place instead of drifting.
  const reorder = (units, desiredFn) => {
    const groups = [];
    let pending = [];
    for (const u of units) {
      const key = desiredFn(u);
      if (key == null) { pending.push(u); continue; }
      if (groups.length === 0) groups.push({ key, items: [...pending, u] });
      else groups.push({ key, items: [u] });
      pending = [];
    }
    if (groups.length === 0) { packLayer(units); return units; }
    groups[groups.length - 1].items.push(...pending);
    const merged = groups;
    merged.sort((a, b) => a.key - b.key);
    const sorted = merged.flatMap(g => g.items);
    sorted.forEach(orientCouple);
    packLayer(sorted);
    return sorted;
  };
  // Flip a couple so the partner with roots in the tree faces their own family.
  function orientCouple(u) {
    if (u.members.length !== 2) return;
    const [a, b] = u.members;
    const pa = people.get(a), pb = people.get(b);
    const side = (p) => {
      // Where does this person's family sit relative to this unit? (<0 left, >0 right, null unknown)
      const refs = [...p.parents, ...p.siblings].map(id => personX.get(id)).filter(x => x != null);
      if (!refs.length) return null;
      return refs.reduce((s, x) => s + x, 0) / refs.length - unitCenter(u);
    };
    const sa = side(pa), sb = side(pb);
    let swap = false;
    if (sa != null && sb != null) swap = sa > sb;             // both rooted: keep the left-rooted one left
    else if (sa != null) swap = sa > 0;                       // a's family is to the right → a goes right
    else if (sb != null) swap = sb < 0;                       // b's family is to the left → b goes left
    if (swap) u.members.reverse();
  }

  for (let iter = 0; iter < 4; iter++) {
    for (let g = 1; g <= maxGen; g++) layers[g] = reorder(layers[g], desiredFromParents);
    for (let g = maxGen - 1; g >= 0; g--) layers[g] = reorder(layers[g], desiredFromChildren);
  }

  // ── 4. Coordinates ───────────────────────────────────────────────────────────
  const place = (units, desiredFn) => {
    if (!units.length) return;
    const desired = units.map(u => desiredFn(u) ?? unitCenter(u));
    // Minimal center offsets so that order and gaps are respected.
    const offsets = [0];
    for (let i = 1; i < units.length; i++) offsets.push(offsets[i - 1] + (units[i - 1].width + units[i].width) / 2 + M.unitGap);
    const y = isotonic(desired.map((d, i) => d - offsets[i]));
    units.forEach((u, i) => { u.x = y[i] + offsets[i] - u.width / 2; });
    refreshPersonX(units);
  };
  for (let iter = 0; iter < 6; iter++) {
    for (let g = 1; g <= maxGen; g++) place(layers[g], desiredFromParents);
    for (let g = maxGen - 1; g >= 0; g--) place(layers[g], desiredFromChildren);
  }
  // Final pass: let childless units settle under their parents without moving anyone with children.
  for (let g = 1; g <= maxGen; g++) {
    place(layers[g], (u) => u.members.some(m => people.get(m).children.length) ? unitCenter(u) : desiredFromParents(u));
  }

  // ── Output ───────────────────────────────────────────────────────────────────
  const positions = new Map();
  for (const p of list) positions.set(p.id, { x: personX.get(p.id), y: gen.get(p.id) * M.layerH, gen: gen.get(p.id) });

  const unionGeometry = unions.map(u => {
    const xs = u.partners.map(id => personX.get(id));
    const g = gen.get(u.partners[0]);
    const top = g * M.layerH;
    const couple = u.partners.length === 2;
    return {
      id: u.id, partners: u.partners, children: u.children, couple,
      married: u.married, divorced: u.divorced, widowed: u.widowed,
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      lineY: top + M.photoR,                               // couple line through the photo centers
      x1: Math.min(...xs) + M.photoR, x2: Math.max(...xs) - M.photoR,
      dropFrom: couple ? top + M.photoR : top + M.nodeH,   // where the line to children starts
      childTop: (g + 1) * M.layerH,
      busY: (g + 1) * M.layerH - 40,
    };
  });

  const xs = [...positions.values()].map(p => p.x);
  const minX = Math.min(...xs) - M.nodeW / 2, maxX = Math.max(...xs) + M.nodeW / 2;
  const bounds = { x: minX, y: 0, width: maxX - minX, height: maxGen * M.layerH + M.nodeH };

  return { positions, unions: unionGeometry, bounds, layers: layers.map(l => l.map(u => u.members)), metrics: M };
}

/** Order the people in a spouse-connected group as a chain: spouse – person – spouse. */
function chainOrder(ids, adj, people) {
  const byIndex = (a, b) => people.get(a).index - people.get(b).index;
  if (ids.length <= 2) return [...ids].sort(byIndex);
  const inGroup = new Set(ids);
  const deg = (id) => adj.get(id).filter(n => inGroup.has(n)).length;
  const start = [...ids].sort(byIndex).find(id => deg(id) === 1) ?? ids[0];
  const order = [start];
  const seen = new Set([start]);
  let cur = start;
  for (;;) {
    const next = adj.get(cur).filter(n => inGroup.has(n) && !seen.has(n)).sort(byIndex)[0];
    if (!next) break;
    order.push(next); seen.add(next); cur = next;
  }
  for (const id of [...ids].sort(byIndex)) if (!seen.has(id)) order.push(id);
  return order;
}

function minIndex(unit, people) {
  return Math.min(...unit.members.map(m => people.get(m).index));
}

/** Pool-adjacent-violators: least-squares non-decreasing fit. */
function isotonic(values) {
  const blocks = [];
  for (const v of values) {
    let b = { sum: v, n: 1, mean: v };
    while (blocks.length && blocks[blocks.length - 1].mean > b.mean) {
      const prev = blocks.pop();
      b = { sum: prev.sum + b.sum, n: prev.n + b.n, mean: (prev.sum + b.sum) / (prev.n + b.n) };
    }
    blocks.push(b);
  }
  const out = [];
  for (const b of blocks) for (let i = 0; i < b.n; i++) out.push(b.mean);
  return out;
}
