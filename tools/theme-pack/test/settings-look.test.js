const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// A stand-in for the Settings bundle holding only the four anchors the patcher edits, so no LG code is needed.
const FIXTURE = [
  '!function(){',
  'const I=["Picture","Sound","Channels","Network","General","Safety","Accessibility"];',
  'const M=Object(u.a)({modal:!0,onCancel:"closeOsd"},v.a);',
  'x={Picture:d.a,Safety:m.a,Accessibility:y.a};',
  'f(C(M,{icon:"\\ua5a6",target:"Safety"},void 0,"Safety"),C(M,{icon:"\\ua5a8",target:"Accessibility",onSelect:0},void 0,"Accessibility"));',
  '}();'
].join('\n');
const PAGE = '<html><head><script>window.onload=function(){if("undefined"==typeof App){load()}}</script></head></html>';
const CSS = '.moonstone .spottable:focus{background-color:#cf0652;color:#fff}.x{border-color:#CF0652}.y{color:#fff}';

function patched() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-look-'));
  fs.mkdirSync(path.join(dir, 'app'));
  fs.writeFileSync(path.join(dir, 'app', 'main.js'), FIXTURE);
  fs.writeFileSync(path.join(dir, 'app', 'index.html'), PAGE);
  fs.writeFileSync(path.join(dir, 'app', 'index.en.html'), PAGE);
  fs.writeFileSync(path.join(dir, 'app', 'main.css'), CSS);
  execFileSync('node', [path.join(__dirname, '..', 'webos', 'settings-look.mjs'), '--app', path.join(dir, 'app'), '--out', path.join(dir, 'out')]);
  return path.join(dir, 'out');
}

function lookPanel(mainJs) {
  const start = mainJs.indexOf('function __themepackLook(n){');
  const end = mainJs.indexOf('const M=Object(u.a)', start);
  const factory = new Function(mainJs.slice(start, end) + '; return __themepackLook;')();
  const store = {};
  global.window = { localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  class Component { constructor(p) { this.props = p; } setState(f) { this.state = Object.assign({}, this.state, typeof f === 'function' ? f(this.state) : f); } }
  const React = { Component, createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const mods = { 0: React, 5: { a: 'Panel' }, 8: { a: 'Scroller' }, 3: { a: (s) => s }, 11: { e: 'RadioItem', f: 'SwitchItem' } };
  const n = (i) => mods[i];
  n.n = (m) => ({ a: m });
  const Look = factory(n);
  return { panel: new Look({}), store };
}

test('patcher makes every edit, and pages load main.js instead of the snapshot', () => {
  const out = patched();
  const js = fs.readFileSync(path.join(out, 'main.js'), 'utf8');
  assert.match(js, /Look:__themepackLook\(n\)/);
  assert.match(js, /"Safety","Look","Accessibility"/);
  assert.match(js, /target:"Look"/);
  ['index.html', 'index.en.html'].forEach((f) => assert.doesNotMatch(fs.readFileSync(path.join(out, f), 'utf8'), /typeof App/));
});

test('theme switches keep each other when the rows hold handlers from an old render', () => {
  const { panel, store } = lookPanel(fs.readFileSync(path.join(patched(), 'main.js'), 'utf8'));
  const rows = panel.render().children[0].children[0];
  const press = (id) => rows.find((r) => r.props['data-component-id'] === id).props.onToggle();
  ['look-theme-winter', 'look-theme-halloween', 'look-theme-glow', 'look-theme-halloween', 'look-style-bubble'].forEach(press);
  assert.deepStrictEqual(panel.state.themes.slice().sort(), ['glow', 'winter']);
  assert.strictEqual(panel.state.style, 'bubble');
  assert.deepStrictEqual(JSON.parse(store['themepack.look']), panel.state);
});

test('focus colours become variables with stock defaults; unrelated white text is left alone', () => {
  const css = fs.readFileSync(path.join(patched(), 'main.css'), 'utf8');
  assert.match(css, /^:root\{--tp-focus:#cf0652;--tp-focus-ink:#fff\}/);
  assert.match(css, /\.spottable:focus\{background-color:var\(--tp-focus\);color:var\(--tp-focus-ink\)\}/);
  assert.match(css, /\.x\{border-color:var\(--tp-focus\)\}/);
  assert.match(css, /\.y\{color:#fff\}/);
  assert.doesNotMatch(css.replace(/^:root\{[^}]*\}/, ''), /#cf0652/i);
});
