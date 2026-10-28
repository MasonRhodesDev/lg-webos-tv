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

test('every style ships its font files as TrueType, with the font\'s licence beside them', () => {
  fs.readdirSync(path.join(dir, 'packs/styles')).map((f) => require('../packs/styles/' + f)).forEach((s) => {
    assert.ok(s.font.files && s.font.files.length, s.id + ' lists no font files');
    s.font.files.forEach((f) => {
      assert.ok(/\.ttf$/.test(f), s.id + ': ' + f + ' is not a .ttf (the compositor\'s Qt reads no WOFF)');
      assert.ok(fs.existsSync(path.join(dir, 'packs/fonts', f)), s.id + ' is missing fonts/' + f);
      assert.ok(fs.existsSync(path.join(dir, 'packs/fonts', path.dirname(f), 'OFL.txt')), s.id + ': no OFL.txt beside ' + f);
    });
  });
});
