#!/usr/bin/env node
// Generate a bcrypt hash for ADMIN_PASSWORD_HASH.
// Usage:
//   node scripts/hash-password.mjs "my-secret-password"
//   npm run hash-password -- "my-secret-password"

import bcrypt from "bcryptjs";

const pwd = process.argv[2];
if (!pwd) {
  console.error("Usage: node scripts/hash-password.mjs <password>");
  process.exit(1);
}

const salt = bcrypt.genSaltSync(12);
const hash = bcrypt.hashSync(pwd, salt);
console.log(hash);
