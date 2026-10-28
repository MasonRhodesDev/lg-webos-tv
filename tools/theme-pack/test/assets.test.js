const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TP = require('../runtime/theme-pack.js');

const dir = path.join(__dirname, '..');
const themes = fs.readdirSync(path.join(dir, 'packs/themes')).map((f) => require('../packs/themes/' + f));

test('every recipe asset exists in its theme\'s asset pack', () => {
  themes.forEach((t) => t.recipes.filter((r) => r.asset).forEach((r) => {
    assert.ok(fs.existsSync(path.join(dir, 'packs/assets', t.id, r.asset)), t.id + ' is missing assets/' + t.id + '/' + r.asset);
  }));
});

test('every recipe fill is a colour or a style token', () => {
  themes.forEach((t) => t.recipes.filter((r) => r.fill).forEach((r) => {
    assert.ok(/^(#[0-9a-f]{3,8}|rgba?\()/i.test(r.fill) || TP.TOKENS.indexOf(r.fill) >= 0, t.id + ': fill ' + r.fill);
  }));
});
