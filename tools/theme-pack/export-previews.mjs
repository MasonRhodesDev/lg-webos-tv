#!/usr/bin/env node
// Renders the shots for the design canvas's generated "pack" page: our surfaces in a few looks, drawn by the QML kit
// through the preview harness (preview/render.mjs), into OUT_DIR as PNGs, index.html (a contact sheet) and
// index.json (each shot's scene, state, style, themes and file). Putting them on the canvas is done by hand.
//
//   node export-previews.mjs OUT_DIR [--scene NAME]... [--look STYLE[+THEME...]]... [--jobs N]
//
// Without --scene, every surface scene (not the kit's contact sheets or test scenes); without --look, the looks below.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCENES = ['Alert', 'InputPicker', 'QuickSettings', 'QuickSheet', 'Settings', 'Toast', 'VolumeBar', 'VolumeMute'];
const LOOKS = ['smoke', 'smoke+winter', 'smoke+halloween', 'bubble+glow'];

const argv = process.argv.slice(2);
if (!argv.length || argv[0].startsWith('--')) {
  console.error('usage: export-previews.mjs OUT_DIR [--scene NAME]... [--look STYLE[+THEME...]]... [--jobs N]');
  process.exit(2);
}
const args = argv.slice();
if (!args.includes('--scene')) SCENES.forEach((s) => args.push('--scene', s));
if (!args.includes('--look')) LOOKS.forEach((l) => args.push('--look', l));
const r = spawnSync(process.execPath, [path.join(here, 'preview', 'render.mjs'), ...args], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
