const test = require('node:test');
const assert = require('node:assert');
const TP = require('../runtime/theme-pack.js');
['smoke', 'bubble'].forEach((id) => TP.register(require('../packs/styles/' + id + '.js')));
['glow', 'winter', 'halloween'].forEach((id) => TP.register(require('../packs/themes/' + id + '.js')));
const { screens } = require('../screens/screens.js');

const el = TP.el;
const tile = (props) => el('tile', Object.assign({ label: 'T', sub: 's' }, props));
const html = (node, opts) => TP.renderScreen(node, Object.assign({ style: 'smoke', themes: [] }, opts));

function slots(markup) {
  return [...markup.matchAll(/data-tp-slot="([a-z]+)"/g)].map((m) => m[1]);
}
function slotBody(markup, slot) {
  const start = markup.indexOf('data-tp-slot="' + slot + '"');
  const open = markup.indexOf('>', start) + 1;
  let depth = 1, i = open;
  const re = /<\/?div\b/g;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(markup))) {
    depth += m[0] === '<div' ? 1 : -1;
    if (depth === 0) { i = m.index; break; }
  }
  return markup.slice(open, i);
}
function ringIds(body) {
  return [...body.matchAll(/data-tp-ring="([a-z]+)"/g)].map((m) => m[1]);
}
function zOf(markup, slot) {
  const s = markup.indexOf('data-tp-slot="' + slot + '"');
  return Number(/z-index:(\d+)/.exec(markup.slice(s, s + 400))[1]);
}

test('every component renders back, origin, front, attach in that order', () => {
  assert.deepStrictEqual(slots(html(tile({}))), ['back', 'origin', 'front', 'attach']);
});

test('themes off leaves both decorator slots present and empty', () => {
  const m = html(tile({ focused: true }));
  assert.strictEqual(slotBody(m, 'back'), '');
  assert.strictEqual(slotBody(m, 'front'), '');
});

test('decor off empties the slots even with themes selected', () => {
  const m = html(tile({ focused: true }), { themes: ['glow', 'winter'], decor: false });
  assert.strictEqual(slotBody(m, 'back'), '');
  assert.strictEqual(slotBody(m, 'front'), '');
});

test('later themes wrap further out: back rings reversed, front rings in order', () => {
  const m = html(tile({ focused: true }), { themes: ['glow', 'winter'] });
  const back = ringIds(slotBody(m, 'back'));
  const front = ringIds(slotBody(m, 'front'));
  assert.deepStrictEqual(back.filter((v, i, a) => a.indexOf(v) === i), ['winter', 'glow'].filter((t) => back.includes(t)));
  assert.deepStrictEqual(front.filter((v, i, a) => a.indexOf(v) === i), ['glow', 'winter']);
});

test('focus lifts all four layers together', () => {
  const rest = html(tile({}));
  const lifted = html(tile({ focused: true }));
  ['back', 'origin', 'front', 'attach'].forEach((s, i) => {
    assert.strictEqual(zOf(rest, s), i + 1);
    assert.strictEqual(zOf(lifted, s), i + 11);
  });
});

test('attachments come after the front slot and are full components', () => {
  const m = html(tile({ attach: [{ type: 'chip', props: { text: '2' } }] }), { themes: ['winter'] });
  const attach = slotBody(m, 'attach');
  assert.match(attach, /data-tp="chip"/);
  assert.deepStrictEqual(slots(attach), ['back', 'origin', 'front', 'attach']);
  assert.ok(ringIds(slotBody(attach, 'back')).includes('winter'), 'chip gets its own winter decoration');
});

test('disabled keeps its surface; only the ink changes', () => {
  const m = html(tile({ disabled: true }));
  const origin = m.slice(m.indexOf('data-tp-slot="origin"'), m.indexOf('data-tp-slot="front"'));
  assert.match(origin, /background:var\(--tp-surface\)/);
  assert.match(origin, /color:var\(--tp-ink-disabled\)/);
  assert.doesNotMatch(origin, /opacity:0\.4/);
});

test('every style defines every token, and every theme reads only tokens', () => {
  TP.list('style').forEach((s) => assert.deepStrictEqual(TP.missingTokens(s), [], s.id + ' is missing tokens'));
  TP.list('theme').forEach((t) => t.reads.forEach((r) => assert.ok(TP.TOKENS.includes(r), t.id + ' reads unknown token ' + r)));
});

test('every theme recipe only references tokens every style defines', () => {
  TP.list('theme').forEach((t) => t.recipes.forEach((r) => {
    [...(r.style || '').matchAll(/var\(--tp-([a-z0-9-]+)\)/g)].forEach((m) => {
      assert.ok(t.reads.includes(m[1]), t.id + ' uses --tp-' + m[1] + ' without declaring it in reads');
    });
  }));
});

test('every screen renders with every style and theme combination', () => {
  const styles = TP.list('style').map((s) => s.id);
  const themes = TP.list('theme').map((t) => t.id);
  const combos = [[]].concat(themes.map((t) => [t]), [themes]);
  Object.keys(screens).forEach((name) => styles.forEach((s) => combos.forEach((ts) => {
    const m = html(screens[name]({ style: s, themes: ts }), { style: s, themes: ts });
    assert.match(m, /data-tp="screen"/, name + ' / ' + s + ' / ' + ts.join('+'));
  })));
});

test('look menu lists every installed style and theme and marks the selection', () => {
  const tree = screens.look({ style: 'bubble', themes: ['winter'], focus: 0 });
  assert.deepStrictEqual(tree.items.map((i) => i.id), ['smoke', 'bubble', 'glow', 'winter', 'halloween']);
  const m = html(tree, { style: 'bubble', themes: ['winter'] });
  assert.match(m, /Bubble/);
  assert.match(m, /Halloween/);
});

test('resolving vars leaves no var() for known tokens', () => {
  const s = TP.get('style', 'smoke');
  const out = TP.resolveVars(html(screens.home({ style: 'smoke', themes: ['glow'] }), { themes: ['glow'] }), s);
  assert.doesNotMatch(out, /var\(--tp-/);
});

test('runtime source avoids syntax Chromium 53 lacks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..');
  ['runtime/theme-pack.js', 'screens/screens.js', 'demo/app.js',
    ...fs.readdirSync(path.join(dir, 'packs/styles')).map((f) => 'packs/styles/' + f),
    ...fs.readdirSync(path.join(dir, 'packs/themes')).map((f) => 'packs/themes/' + f)].forEach((f) => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\?\.|\?\?|\.\.\.[a-zA-Z({[]|\basync\b|\bawait\b/, f + ' uses syntax newer than Chromium 53');
    assert.doesNotMatch(src, /[;"']\s*gap:|\binset:/, f + ' uses flex gap or the inset shorthand');
  });
});

test('sliders and switches carry a thumb and knob that themes can dress', () => {
  const vol = html(el('volume', { value: 40 }), { themes: ['halloween'] });
  assert.match(vol, /data-tp="thumb"/);
  const thumb = vol.slice(vol.indexOf('data-tp="thumb"'));
  assert.ok(ringIds(slotBody(thumb, 'front')).includes('halloween'), 'thumb gets the pumpkin');
  const row = html(el('row', { label: 'x', control: 'toggle', on: true }), { themes: ['winter'] });
  const knob = row.slice(row.indexOf('data-tp="knob"'));
  assert.ok(ringIds(slotBody(knob, 'front')).includes('winter'), 'knob gets the snowflake');
});

test('with themes off the thumb is still a plain dot showing the value', () => {
  const vol = html(el('volume', { value: 40 }));
  const thumb = vol.slice(vol.indexOf('data-tp="thumb"'));
  assert.strictEqual(slotBody(thumb, 'front'), '');
  assert.match(vol, /left:40%/);
});

test('the demo decorates its pieces as the contract targets the kit uses', () => {
  const home = html(screens.home({ style: 'smoke', themes: ['halloween'] }), { themes: ['halloween'] });
  const vol = home.slice(home.indexOf('data-tp="volume"'));
  assert.match(slotBody(vol, 'front'), /data-tp-ring="halloween"/, 'the volume bar is a panel: it gets the spider');
  const ribbon = home.slice(home.indexOf('data-tp="ribbon"'));
  assert.match(slotBody(ribbon, 'back'), /data-tp-ring="halloween"/, 'the dock\'s ribbon gets the graveyard');
  assert.match(home, /data-tp="badge"/, 'the Watching tag is a badge');
  const look = html(screens.look({ style: 'smoke', themes: ['winter'] }), { themes: ['winter'] });
  const settings = look.slice(look.indexOf('data-tp="settings"'));
  assert.match(slotBody(settings, 'front'), /data-tp-ring="winter"/, 'Settings is a panel: it gets the snow');
});

test('decoration on a disabled component recedes with it', () => {
  const m = html(tile({ disabled: true }), { themes: ['winter'] });
  assert.match(m, /data-tp-slot="front" style="[^"]*opacity:0\.5/);
  assert.doesNotMatch(html(tile({}), { themes: ['winter'] }), /data-tp-slot="front" style="[^"]*opacity/);
});
