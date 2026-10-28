// Renders the owner's canvas boards (saved .dc.html sources) to PNGs for the contact sheet: the board's template is
// expanded with its own logic (renderVals), imported boards are inlined with their attributes as props, the stand-in
// picture is replaced with black (a TV capture shows the video as black) and the fonts come from packs/fonts, so
// headless Chromium needs no network.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(here, '..', '..', 'packs', 'fonts');
const BLACK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==';

const lookup = (scope, p) => p.trim().split('.').reduce((o, k) => (o == null ? undefined : o[k]), scope);
const holes = (s, scope) => s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, p) => {
  const v = lookup(scope, p);
  return v == null || typeof v === 'function' ? '' : String(v);
});
function ifs(s, scope) {
  let prev;
  do { prev = s; s = s.replace(/<sc-if value="\{\{\s*([^}]+?)\s*\}\}"[^>]*>((?:(?!<sc-if)[\s\S])*?)<\/sc-if>/g, (_, p, inner) => (lookup(scope, p) ? inner : '')); } while (s !== prev);
  return s;
}
const fors = (s, scope) => s.replace(/<sc-for list="\{\{\s*([^}]+?)\s*\}\}" as="(\w+)"[^>]*>([\s\S]*?)<\/sc-for>/g, (_, p, as, inner) =>
  (lookup(scope, p) || []).map((item, i) => { const sc = Object.assign({}, scope, { [as]: item, $index: i }); return holes(ifs(inner, sc), sc); }).join(''));

function parts(html) {
  const body = (html.match(/<x-dc>([\s\S]*?)<\/x-dc>/) || [, ''])[1];
  const helmet = (body.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ''])[1];
  const script = (html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/) || [, ''])[1];
  return { tpl: body.replace(/<helmet>[\s\S]*?<\/helmet>/, ''), helmet, script };
}

// One board's HTML body, expanded. `dir` holds the boards it imports.
export function expand(html, props = {}, dir = '.', depth = 0) {
  const { tpl, script } = parts(html);
  class DCLogic { constructor(p) { this.props = p; this.state = {}; } setState() {} }
  let vals = {};
  if (script.trim()) {
    const Component = new Function('DCLogic', script + '\nreturn typeof Component === "undefined" ? null : Component;')(DCLogic);
    if (Component) vals = new Component(props).renderVals() || {};
  }
  const scope = Object.assign({ props }, props, vals);
  let out = holes(ifs(fors(tpl, scope), scope), scope);
  out = out.replace(/<dc-import\s+([^>]*?)\s*>\s*<\/dc-import>/g, (whole, attrs) => {
    const a = {};
    for (const m of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) a[m[1]] = m[2];
    const f = path.join(dir, a.name + '.dc.html');
    if (depth > 4 || !fs.existsSync(f)) return '<div>missing board ' + a.name + '</div>';
    const p = Object.assign({}, a); delete p.name; delete p['hint-size'];
    return expand(fs.readFileSync(f, 'utf8'), p, dir, depth + 1);
  });
  return out.replace(/src="\/_blob\/[^"]*"/g, 'src="' + BLACK + '"');
}

function fontFaces() {
  const css = [];
  if (!fs.existsSync(FONTS)) return '';
  for (const fam of fs.readdirSync(FONTS)) {
    const d = path.join(FONTS, fam);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      const w = (f.match(/-(\d+)\.ttf$/) || [])[1];
      if (w) css.push("@font-face{font-family:'" + fam + "';font-weight:" + w + ";src:url('" + pathToFileURL(path.join(d, f)).href + "')}");
    }
  }
  return '<style>' + css.join('') + '</style>';
}

export function page(file) {
  const html = fs.readFileSync(file, 'utf8');
  const { helmet } = parts(html);
  const head = helmet.replace(/<link[^>]*fonts\.googleapis[^>]*>/g, '');
  return '<!doctype html><html><head><meta charset="utf-8">' + fontFaces() + head + '<style>body{margin:0;background:#000}</style></head><body>' +
    expand(html, {}, path.dirname(file)) + '</body></html>';
}

export function chromium() {
  for (const c of [process.env.CHROMIUM, 'chromium', 'chromium-browser', 'google-chrome']) {
    if (c && spawnSync(c, ['--version'], { encoding: 'utf8' }).status === 0) return c;
  }
  return null;
}

// Renders `name` from `dir` into `outDir/name.png`; returns the path, or null with the reason.
export function render(dir, name, outDir) {
  const src = path.join(dir, name + '.dc.html');
  if (!fs.existsSync(src)) return { file: null, why: 'no board ' + name + ' in ' + dir };
  const bin = chromium();
  if (!bin) return { file: null, why: 'no Chromium (set CHROMIUM)' };
  fs.mkdirSync(outDir, { recursive: true });
  const htmlFile = path.join(outDir, name + '.html'), png = path.join(outDir, name + '.png');
  if (fs.existsSync(png)) return { file: png };
  fs.writeFileSync(htmlFile, page(src));
  const r = spawnSync(bin, ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=5000',
    '--window-size=1920,1080', '--screenshot=' + png, pathToFileURL(htmlFile).href], { encoding: 'utf8', timeout: 60000 });
  return fs.existsSync(png) ? { file: png } : { file: null, why: 'Chromium failed: ' + (r.stderr || '').trim().split('\n').pop() };
}
