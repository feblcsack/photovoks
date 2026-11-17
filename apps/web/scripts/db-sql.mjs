#!/usr/bin/env node
// Prints every migration in order as ONE SQL script, ready to paste into
// Supabase Dashboard → SQL Editor → Run.
//   pnpm -s db:sql | pbcopy       (macOS: copies to clipboard)
//   pnpm -s db:sql > setup.sql    (any OS)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  process.stdout.write(`\n-- >>> ${f}\n${fs.readFileSync(path.join(dir, f), 'utf8')}\n`);
}
