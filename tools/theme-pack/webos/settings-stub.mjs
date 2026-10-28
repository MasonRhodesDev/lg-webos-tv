#!/usr/bin/env node
// Builds the Settings stub, the app the boot hook mounts over LG's Settings app (see settings-stub/stub.js).
//   node settings-stub.mjs OUT_DIR
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
if (!out) { console.error('usage: settings-stub.mjs OUT_DIR'); process.exit(2); }

// LG's deep-link names to our page ids: a catalog lgTargets entry is a page, or a path whose last step is the page.
const catalog = JSON.parse(readFileSync(join(here, '..', 'settings', 'catalog.json'), 'utf8'));
const targets = {};
for (const [name, where] of Object.entries(catalog.lgTargets.map)) {
  targets[name] = Array.isArray(where) ? where[where.length - 1] : where;
}

mkdirSync(out, { recursive: true });
for (const f of ['appinfo.json', 'index.html', 'stub.js']) copyFileSync(join(here, 'settings-stub', f), join(out, f));
copyFileSync(join(here, '..', 'tv', 'icon.png'), join(out, 'icon.png'));
writeFileSync(join(out, 'targets.js'), '// Built by settings-stub.mjs from settings/catalog.json.\nvar SETTINGS_TARGETS = ' +
  JSON.stringify(targets, null, 1) + ';\n');
console.log(`settings stub written to ${out} (${Object.keys(targets).length} LG targets)`);
