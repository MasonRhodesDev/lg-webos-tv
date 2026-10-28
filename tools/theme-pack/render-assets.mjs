#!/usr/bin/env node
// Renders each theme recipe that names an `asset` from its inline SVG to a PNG in packs/assets/<theme>/, the asset
// pack the TV's QML renderer draws (the compositor has no SVG plugin). Run after changing a recipe's SVG; the PNGs are
// committed, so building and installing never need this. Needs rsvg-convert.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const SIZE = 128;
for (const f of readdirSync(join(here, 'packs', 'themes'))) {
  const pack = require(join(here, 'packs', 'themes', f));
  for (const r of pack.recipes) {
    if (!r.asset) continue;
    if (!/^<svg[\s>]/.test(r.html || '')) throw new Error(pack.id + ': recipe with asset ' + r.asset + ' needs a single <svg> as html');
    const svg = r.html.replace(/<svg/, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/width="100%" height="100%"/, `width="${SIZE}" height="${SIZE}"`);
    const tmp = join(tmpdir(), 'theme-asset-' + process.pid + '.svg');
    writeFileSync(tmp, svg);
    mkdirSync(join(here, 'packs', 'assets', pack.id), { recursive: true });
    execFileSync('rsvg-convert', ['-w', String(SIZE), '-h', String(SIZE), '-o', join(here, 'packs', 'assets', pack.id, r.asset), tmp]);
    rmSync(tmp);
    console.log(pack.id + '/' + r.asset);
  }
}
