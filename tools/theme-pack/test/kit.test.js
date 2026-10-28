const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TP = require('../packs/tokens.js');

const ui = path.join(__dirname, '..', 'ui', 'Look');

test('the layer\'s stock fallback defines every token, so the kit is whole before the service answers', () => {
  const qml = fs.readFileSync(path.join(ui, 'Look.qml'), 'utf8');
  const block = qml.slice(qml.indexOf('readonly property var stock'), qml.indexOf('})', qml.indexOf('readonly property var stock')));
  const keys = [...block.matchAll(/"([a-z0-9-]+)":/g)].map((m) => m[1]);
  assert.deepStrictEqual(TP.TOKENS.filter((t) => !keys.includes(t)), []);
});

test('every kit component is in the Look module', () => {
  const qmldir = fs.readFileSync(path.join(ui, 'qmldir'), 'utf8');
  fs.readdirSync(path.join(ui, 'kit')).filter((f) => /\.qml$/.test(f)).forEach((f) => {
    assert.match(qmldir, new RegExp('^' + f.replace('.qml', '') + ' 1\\.0 kit/' + f + '$', 'm'), f + ' missing from qmldir');
  });
});

test('kit text goes through Label (the type scale), and Label uses the style font', () => {
  fs.readdirSync(path.join(ui, 'kit')).filter((f) => /\.qml$/.test(f) && f !== 'Label.qml').forEach((f) => {
    const src = fs.readFileSync(path.join(ui, 'kit', f), 'utf8');
    assert.doesNotMatch(src, /^\s*Text\s*\{/m, f + ' draws a Text outside the type scale');
  });
  assert.match(fs.readFileSync(path.join(ui, 'kit', 'Label.qml'), 'utf8'), /font\.family: Look\.font/);
});

test('every style names only type weights its font files carry', () => {
  fs.readdirSync(path.join(__dirname, '..', 'packs', 'styles')).map((f) => require('../packs/styles/' + f)).forEach((s) => {
    const have = s.font.files.map((f) => (/-(\d{3})\.ttf$/.exec(f) || [])[1]);
    TP.TOKENS.filter((t) => /^type-.*-weight$/.test(t)).forEach((t) => {
      assert.ok(have.includes(s.tokens[t]), s.id + ': ' + t + ' is ' + s.tokens[t] + ', not a weight in its font files');
    });
  });
});

test('every Label role used in ui/ is one the styles size and weigh', () => {
  const files = [];
  (function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? walk(path.join(d, e.name)) : /\.qml$/.test(e.name) && files.push(path.join(d, e.name))); })(path.join(__dirname, '..', 'ui'));
  files.forEach((f) => [...fs.readFileSync(f, 'utf8').matchAll(/\brole: "([a-z-]+)"/g)].forEach((m) => {
    assert.ok(TP.TOKENS.includes('type-' + m[1]) && TP.TOKENS.includes('type-' + m[1] + '-weight'), path.basename(f) + ': role ' + m[1]);
  }));
});
