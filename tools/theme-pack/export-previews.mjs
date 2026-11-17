#!/usr/bin/env node
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
