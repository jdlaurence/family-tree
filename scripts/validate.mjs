#!/usr/bin/env node
// Validates family.yaml the same way the website does, plus checks that photos exist.
// Usage: node scripts/validate.mjs [path/to/family.yaml]
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFamily, FamilyDataError } from "../src/data.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] ? resolve(process.argv[2]) : join(root, "family.yaml");

let text;
try {
  text = readFileSync(file, "utf8");
} catch (e) {
  console.error(`✗ Could not read ${file}: ${e.message}`);
  process.exit(1);
}

try {
  const family = parseFamily(text);
  const warnings = [...family.warnings];
  for (const p of family.list) {
    if (p.photo && !existsSync(join(root, "photos", p.photo))) {
      warnings.push({ id: p.id, message: `${p.id}: photo "${p.photo}" not found in photos/ (a placeholder will be shown).` });
    }
  }
  const couples = family.unions.filter(u => u.partners.length === 2).length;
  console.log(`✓ ${file.replace(root + "/", "")} looks good: ${family.list.length} people, ${couples} couples.`);
  for (const w of warnings) console.log(`  ⚠ ${w.message}`);
  process.exit(0);
} catch (e) {
  if (e instanceof FamilyDataError) {
    console.error(`✗ ${e.problems.length} problem${e.problems.length === 1 ? "" : "s"} in ${file.replace(root + "/", "")}:`);
    for (const p of e.problems) console.error(`  • ${p.message}`);
    process.exit(1);
  }
  throw e;
}
