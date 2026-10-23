// Partial-date parsing and formatting.
// Accepts: 1965 | "1965" | "1965-03" | "1965-03-12" | "c. 1932" | "ca. 1932" | "~1932" | "about 1932" | "1932?"
// Returns null for empty input, and { invalid: true, raw } for unparseable input.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

export function parseDate(input) {
  if (input === undefined || input === null || input === "") return null;
  if (input instanceof Date) {
    return { year: input.getFullYear(), month: input.getMonth() + 1, day: input.getDate(), approx: false, raw: input.toISOString().slice(0, 10) };
  }
  const raw = String(input).trim();
  if (!raw) return null;

  let s = raw.toLowerCase();
  let approx = false;
  const approxMatch = s.match(/^(c\.|ca\.|circa|about|abt\.?|~|approx\.?)\s*/);
  if (approxMatch) { approx = true; s = s.slice(approxMatch[0].length); }
  if (s.endsWith("?")) { approx = true; s = s.slice(0, -1).trim(); }

  const m = s.match(/^(\d{3,4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!m) return { invalid: true, raw };
  const year = Number(m[1]);
  const month = m[2] ? Number(m[2]) : null;
  const day = m[3] ? Number(m[3]) : null;
  if (month !== null && (month < 1 || month > 12)) return { invalid: true, raw };
  if (day !== null && (day < 1 || day > 31)) return { invalid: true, raw };
  return { year, month, day, approx, raw };
}

/** "1965" or "c. 1932" — used on the tree itself. */
export function formatYear(d) {
  if (!d || d.invalid) return "";
  return (d.approx ? "c. " : "") + d.year;
}

/** "March 12, 1965", "March 1965", "1965", "c. 1932" — used in the panel. */
export function formatLong(d) {
  if (!d || d.invalid) return "";
  const prefix = d.approx ? "c. " : "";
  if (d.month && d.day) return `${prefix}${MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
  if (d.month) return `${prefix}${MONTHS[d.month - 1]} ${d.year}`;
  return `${prefix}${d.year}`;
}

/** Compact life span for the tree: "b. 1965" (living), "1932 – 2019" (deceased), "d. 2019" (birth unknown). */
export function formatSpan(born, died, deceased) {
  const b = formatYear(born);
  const d = formatYear(died);
  if (b && d) return `${b} – ${d}`;
  if (b && deceased) return `${b} – `;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "";
}

/** Whole years between two partial dates (or until today). Null if unknown. */
export function ageBetween(born, until) {
  if (!born || born.invalid) return null;
  let y, m, day;
  if (until === undefined) {
    const now = new Date();
    y = now.getFullYear(); m = now.getMonth() + 1; day = now.getDate();
  } else {
    if (!until || until.invalid) return null;
    y = until.year; m = until.month ?? 7; day = until.day ?? 1;
  }
  const bm = born.month ?? 7, bd = born.day ?? 1;
  let age = y - born.year;
  if (m < bm || (m === bm && day < bd)) age -= 1;
  // With only years known, be honest about the imprecision.
  return { years: age, approx: born.approx || !born.month || (until && !until.month) };
}

/** Sort key for ordering siblings: year*10000 + month*100 + day; unknowns sort last. */
export function sortKey(d) {
  if (!d || d.invalid) return Number.POSITIVE_INFINITY;
  return d.year * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0);
}
