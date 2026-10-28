#!/usr/bin/env node
// Renders each theme recipe that names an `asset` from its inline SVG to a PNG in packs/assets/<theme>/, the asset
// pack the TV's QML renderer draws (the compositor has no SVG plugin). Run after changing a recipe's SVG; the PNGs are
// committed, so building and installing never need this. Needs rsvg-convert.
//
// A recipe's html is one <svg>, or a field of <svg>s placed with `position:absolute;left;top` in the ring's box. Both
// are composed into one SVG the size of what the CSS draws, and rendered at 2× that size (a box as wide as the screen
// at 1×: the compositor draws at 1920×1080, and 4K textures would only cost memory). The ring's own `opacity` is
// baked in; where the ring sits (its size, which edge) is the QML Ring's job (ui/Look/place.js). Anything else (a
// <div>, a CSS background) is not drawable yet: it's listed, and naming an asset for it is an error.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const SCREEN = [1920, 1080];
// A <svg width="100%"> fills a ring box whose size depends on the component; it renders at this size (CSS px) on its
// longer side, which keeps the thumb assets at their 128 px.
const FREE = 64;

const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const decls = (s) => (s || '').split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/:(.*)/s).map((x) => x.trim()));
const px = (v) => (/^\d+(\.\d+)?px$/.test(v || '') ? parseFloat(v) : null);

function viewBox(a) {
  const v = (a.viewBox || '').split(/[\s,]+/).map(Number);
  return v.length === 4 ? v : null;
}

// The recipe's svgs, or why it can't be drawn.
function parse(r) {
  const els = [...(r.html || '').matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)];
  if (!els.length || els.map((m) => m[0]).join('') !== r.html.trim()) return { why: 'html is not only <svg> elements' };
  for (const [k] of decls(r.style)) {
    if (!/^(left|right|top|bottom|width|height|opacity)$/.test(k)) return { why: 'style has ' + k };
  }
  return { svgs: els.map((m) => ({ a: attrs(m[1]), body: m[2] })) };
}

// The SVG for one recipe, and its CSS size.
export function compose(r) {
  const p = parse(r);
  if (p.why) throw new Error(p.why);
  const style = Object.fromEntries(decls(r.style));
  let w, h;
  if (p.svgs.length === 1 && !(p.svgs[0].a.style || '').includes('position')) {
    const a = p.svgs[0].a, vb = viewBox(a);
    w = px(a.width + 'px');
    h = px(a.height + 'px');
    if (w === null || h === null) {
      if (!vb) throw new Error('a 100% svg needs a viewBox');
      const k = FREE / Math.max(vb[2], vb[3]);
      w = vb[2] * k;
      h = vb[3] * k;
    }
  } else {
    w = px(style.width) || (r.target === 'screen' ? SCREEN[0] : null);
    h = px(style.height) || (r.target === 'screen' ? SCREEN[1] : null);
    if (w === null || h === null) throw new Error('a field of svgs needs a size: a px width and height, or a screen target');
  }
  const body = p.svgs.map(({ a, body }) => {
    const s = Object.fromEntries(decls(a.style));
    const x = px(s.left) || 0, y = px(s.top) || 0;
    const ew = a.width === '100%' ? w : Number(a.width), eh = a.height === '100%' ? h : Number(a.height);
    const flip = /scaleX\(-1\)/.test(s.transform || '');
    const keep = Object.entries(a).filter(([k]) => !/^(style|width|height|x|y|xmlns|aria-hidden)$/.test(k))
      .map(([k, v]) => ` ${k}="${v}"`).join('');
    const g = (s.opacity ? ` opacity="${s.opacity}"` : '') + (flip ? ` transform="matrix(-1 0 0 1 ${2 * x + ew} 0)"` : '');
    return `<g${g}><svg x="${x}" y="${y}" width="${ew}" height="${eh}"${keep}>${body}</svg></g>`;
  }).join('');
  return {
    width: w, height: h, scale: w >= SCREEN[0] ? 1 : 2,
    svg: (scale) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}">` +
      `<g${style.opacity ? ` opacity="${style.opacity}"` : ''}>${body}</g></svg>`
  };
}

export function drawable(r) { return !parse(r).why; }

function main() {
  const done = {};
  for (const f of readdirSync(join(here, 'packs', 'themes'))) {
    const pack = require(join(here, 'packs', 'themes', f));
    for (const r of pack.recipes) {
      if (!r.html) continue;
      const where = pack.id + ' ' + r.target + '/' + r.slot;
      if (!r.asset) {
        console.log('not drawn: ' + where + (drawable(r) ? ' (drawable: name an asset)' : ': ' + parse(r).why));
        continue;
      }
      const key = pack.id + '/' + r.asset, src = r.html + '|' + r.style;
      if (done[key] !== undefined) {
        if (done[key] !== src) throw new Error(key + ' is named by recipes with different html or style');
        continue;
      }
      done[key] = src;
      let c;
      try { c = compose(r); } catch (e) { throw new Error(where + ' (asset ' + r.asset + '): ' + e.message); }
      mkdirSync(join(here, 'packs', 'assets', pack.id), { recursive: true });
      execFileSync('rsvg-convert', ['-o', join(here, 'packs', 'assets', pack.id, r.asset)], { input: c.svg(c.scale) });
      console.log(key + ' ' + c.width * c.scale + 'x' + c.height * c.scale);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
