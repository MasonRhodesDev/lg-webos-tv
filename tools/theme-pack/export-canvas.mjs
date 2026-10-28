#!/usr/bin/env node
// Writes one Design-canvas board (.dc.html) per screen for a style and theme combination.
// CSS variables are resolved to literal values so boards paint while loading and stay editable.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const TP = require('./runtime/theme-pack.js');
for (const kind of ['styles', 'themes']) {
  for (const f of readdirSync(join(here, 'packs', kind))) TP.register(require(join(here, 'packs', kind, f)));
}
const { screens } = require('./screens/screens.js');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const out = arg('out');
if (!out) {
  console.error('usage: export-canvas.mjs --out DIR [--style smoke] [--themes a,b] [--screens home,quick] [--picture URL] [--credit TEXT] [--prefix Pack]');
  process.exit(2);
}
const styleId = arg('style', 'smoke');
const themes = (arg('themes', '') || '').split(',').filter(Boolean);
const names = (arg('screens', Object.keys(screens).join(','))).split(',');
const picture = arg('picture', '');
const credit = arg('credit', '');
const prefix = arg('prefix', 'Pack');
const style = TP.get('style', styleId);
if (!style) throw new Error('unknown style ' + styleId);

const label = [style.name].concat(themes.map((t) => TP.get('theme', t).name)).join(' + ');
mkdirSync(out, { recursive: true });

for (const name of names) {
  if (!screens[name]) throw new Error('unknown screen ' + name);
  const tree = screens[name]({ style: styleId, themes, picture, credit });
  const body = TP.resolveVars(TP.renderScreen(tree, { style: styleId, themes }), style);
  const file = [prefix, styleId, themes.join('-') || 'plain', name].join('_') + '.dc.html';
  writeFileSync(join(out, file), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} · ${label}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${style.font.google.replace(/&/g, '&amp;')}&amp;display=swap">
<style>
body{margin:0}
</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":1920,"height":1080}}'>
class Component extends DCLogic {
  renderVals() {
    return {};
  }
}
</script>
</body>
</html>
`);
  console.log(file);
}
