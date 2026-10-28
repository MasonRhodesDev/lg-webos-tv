#!/usr/bin/env node
// Writes each style and theme pack as JSON, the format the Look service reads and serves.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: export-json.mjs OUT_DIR'); process.exit(2); }
for (const kind of ['styles', 'themes']) {
  mkdirSync(join(out, kind), { recursive: true });
  for (const f of readdirSync(join(here, 'packs', kind))) {
    const pack = require(join(here, 'packs', kind, f));
    writeFileSync(join(out, kind, pack.id + '.json'), JSON.stringify(pack, null, 2));
  }
}
console.log('packs written to ' + out);
