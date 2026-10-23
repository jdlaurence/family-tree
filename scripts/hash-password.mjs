#!/usr/bin/env node
// Usage: node scripts/hash-password.mjs "your password"
// Prints the SHA-256 hash to paste into config.js → passwordHash.
import { createHash } from "node:crypto";

const pw = process.argv.slice(2).join(" ");
if (!pw) {
  console.error('Usage: node scripts/hash-password.mjs "your password"');
  process.exit(1);
}
console.log(createHash("sha256").update(pw).digest("hex"));
