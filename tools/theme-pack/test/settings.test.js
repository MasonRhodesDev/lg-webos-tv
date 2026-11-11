const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

// Our own Settings: the generated catalog module, the page framework's tree, and the key-driven navigation test in
// the preview harness (Qt 5's qmltestrunner: QML_TEST_BIN, default qmltestrunner-qt5 or qmltestrunner).
const dir = path.join(__dirname, '..');
const lib = (f, ctx) => vm.runInContext(fs.readFileSync(path.join(dir, 'ui/Look/settings', f), 'utf8')
  .replace(/^\.pragma library$/m, '').replace(/^\.import .*$/mg, ''), ctx);
function modules() {
  const C = vm.createContext({}); lib('catalog.js', C);
  const M = vm.createContext({}); lib('menu.js', M);
  const P = vm.createContext({ Catalog: C, Menu: M }); lib('pages.js', P);
  return { C, M, P };
}
function onPath(name) {
  if (name.indexOf('/') >= 0) return fs.existsSync(name) ? name : null;
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    try { fs.accessSync(path.join(d, name), fs.constants.X_OK); return path.join(d, name); } catch (e) { /* next */ }
  }
  return null;
}
const runner = process.env.QML_TEST_BIN ? onPath(process.env.QML_TEST_BIN) : onPath('qmltestrunner-qt5') || onPath('qmltestrunner');

test('ui/Look/settings/catalog.js is current with settings/*.json', () => {
  const r = spawnSync(process.execPath, [path.join(dir, 'settings/build-catalog.mjs'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});

test('every page and item our menu names exists, and every catalog page is reachable', () => {
  const { C, M, P } = modules();
  const known = (ref) => !!(M.extra[ref] || C.items[ref]);
  const pages = Object.assign({ quick: M.quick }, M.pages);
  for (const id of Object.keys(pages)) for (const r of pages[id].rows) {
    if (r.item) assert.ok(known(r.item), id + ': item ' + r.item);
    if (r.action) assert.ok(known(r.action), id + ': action ' + r.action);
    if (r.value) assert.ok(known(r.value), id + ': value ' + r.value);
    if (r.page) assert.ok(P.exists(r.page), id + ': page ' + r.page);
  }
  for (const c of M.categories) assert.ok(M.pages[c.page], 'category ' + c.id + ' has a designed page');
  // Walk the tree from the categories through every page link.
  const seen = new Set(), todo = M.categories.map((c) => c.page);
  const store = { state: (ref) => ({ item: C.items[ref] || M.extra[ref], visible: true, active: true, label: '', options: [], min: 0, max: 1, step: 1 }),
                  holds: () => true, item: (ref) => C.items[ref] || M.extra[ref] };
  while (todo.length) {
    const id = todo.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === 'Look') continue;
    for (const r of P.model({ id }, store, {})) if (r.kind === 'page') todo.push(r.entry.id);
  }
  const missing = C.catalog.order.filter((id) => !seen.has(id) && !C.catalog.pages[id].region);
  assert.deepStrictEqual([...missing], []);
});

test('every LG deep-link target opens a page of ours', () => {
  const { C, P } = modules();
  for (const name of Object.keys(C.catalog.targets)) {
    const stack = P.target(name), last = C.catalog.targets[name][C.catalog.targets[name].length - 1];
    assert.ok(stack.length > 0, name);
    if (P.exists(last)) assert.strictEqual(stack[stack.length - 1], last, name);
  }
});

test('Settings and the quick sheet follow remote keys, Hook A and LG\'s Back', { skip: !runner && 'qmltestrunner not found' }, () => {
  const r = spawnSync(runner, ['-import', path.join(dir, 'preview/mocks'), '-import', path.join(dir, 'ui'),
    '-input', path.join(dir, 'preview/tests/tst_SettingsNav.qml')], {
    encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, { QT_FORCE_STDERR_LOGGING: '1', QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' })
  });
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/Totals: \d+ passed, 0 failed/.test(out), out);
  const warnings = out.split('\n').filter((l) => /\.(qml|js):\d+/.test(l) && !/^\s*Loc:/.test(l));
  assert.deepStrictEqual(warnings, []);
});

test('the footer and Privacy and terms claim only what LG\'s eulaStatus reply and the telemetry-off kit prove', () => {
  const { M } = modules();
  const all = (v) => { const o = { generalTermsAllowed: true }; for (const k of M.dataAgreements) o[k] = v; return o; };
  const oneTrue = Object.assign(all(false), { voiceAllowed: true });
  const partial = all(false); delete partial.chpAllowed;
  const strings = Object.assign(all(false), { acrOnAllowed: 'false' });
  const cases = [
    [{}, '', ''], [{ generalTermsAllowed: true }, '', ''], [partial, '', ''], [strings, '', ''], [null, '', ''],
    [all(false), 'agreements withdrawn', 'Agreements withdrawn'], [oneTrue, 'telemetry on', 'Accepted']
  ];
  for (const [eula, footer, privacy] of cases) {
    assert.strictEqual(M.telemetryLabel(undefined, eula), footer, JSON.stringify(eula));
    assert.strictEqual(M.telemetryLabel('inactive', eula), footer, 'kit inactive: ' + JSON.stringify(eula));
    assert.strictEqual(M.valueLabel('agreements', eula), privacy, 'agreements: ' + JSON.stringify(eula));
  }
  assert.strictEqual(M.telemetryLabel('active', all(false)), 'telemetry off', 'the kit in force and agreements withdrawn');
  assert.strictEqual(M.telemetryLabel('active', {}), 'telemetry off', 'the kit in force, agreements unreadable');
  assert.strictEqual(M.telemetryLabel('active', oneTrue), 'telemetry on', 'an accepted agreement wins over the kit');
  const stringTrue = Object.assign(all(false), { acrOnAllowed: 'true' });
  assert.strictEqual(M.telemetryLabel('active', stringTrue), 'telemetry on', 'accepted as a string, with the kit active');
  assert.strictEqual(M.telemetryLabel(undefined, stringTrue), 'telemetry on', 'accepted as a string');
  assert.strictEqual(M.valueLabel('agreements', stringTrue), 'Accepted');
});

// The Look page's rows, from the service's answer as Look.qml holds it.
const lookWith = (chosen, themes) => ({ chosen, available: { styles: [{ id: 'smoke', name: 'Smoke' }], themes } });
const plainRows = (rows) => JSON.parse(JSON.stringify(rows));

test('the Look page keeps one themes list when the service lists no seasonal theme', () => {
  const { P } = modules();
  // An older service: no group, no auto.
  const rows = plainRows(P.lookRows(null, lookWith({ style: 'smoke', themes: ['winter'] },
    [{ id: 'glow', name: 'Glow', description: 'A glow' }, { id: 'winter', name: 'Winter' }])));
  assert.deepStrictEqual(rows.map((r) => r.section || r.label), ['Style', 'Smoke', 'Themes', 'Glow', 'Winter']);
  assert.deepStrictEqual(rows.slice(3).map((r) => [r.variant, r.kind, r.on, r.hint]), [['toggle', 'theme', false, 'A glow'], ['toggle', 'theme', true, '']]);
});

test('the Look page shows a season\'s dates, whatever the window', () => {
  const { P } = modules();
  const span = (from, to) => P.dateSpan({ from, to });
  assert.strictEqual(span('2026-12-01', '2026-12-25'), 'Dec 1 – 25');
  assert.strictEqual(span('2026-12-26', '2027-01-03'), 'Dec 26 – Jan 3');
  assert.strictEqual(span('2026-09-23', '2026-11-30'), 'Sep 23 – Nov 30');
  assert.strictEqual(span('2026-07-04', '2026-07-04'), 'Jul 4');
  assert.strictEqual(span('2026-03-05', '2027-03-04'), 'Mar 5 – Mar 4', 'the same month a year on');
  assert.strictEqual(span('soon', '2027-01-03'), '');
  assert.strictEqual(P.seasonDates({ dates: [{ from: '2027-03-20', to: '2027-03-29' }, { from: '2027-09-01', to: '2027-09-02' }] }),
    'Mar 20 – 29, Sep 1 – 2');
  assert.strictEqual(P.seasonDates({}), '', 'a service that gives no dates');
});

test('picking a seasonal theme replaces the seasonal themes that are on; the calendar\'s list flips one theme', () => {
  const { P } = modules();
  const themes = [{ id: 'glow', name: 'Glow', group: 'custom' }, { id: 'mine', name: 'Mine' },
    { id: 'winter', name: 'Winter', group: 'seasonal' }, { id: 'christmas', name: 'Christmas', group: 'seasonal' },
    { id: 'autumn', name: 'Autumn', group: 'seasonal' }];
  // What the calendar left on when Automatic was turned off: a season and a holiday.
  const L = lookWith({ style: 'smoke', themes: ['winter', 'glow', 'christmas', 'mine'], auto: false, skip: ['autumn'] }, themes);
  assert.deepStrictEqual(plainRows(P.seasonPicked(L, 'autumn')), ['glow', 'mine', 'autumn']);
  assert.deepStrictEqual(plainRows(P.seasonPicked(L, '')), ['glow', 'mine']);
  assert.deepStrictEqual(plainRows(P.skipFlipped(L, 'winter')), ['autumn', 'winter']);
  assert.deepStrictEqual(plainRows(P.skipFlipped(L, 'autumn')), []);
  const rows = plainRows(P.lookRows(null, L));
  assert.deepStrictEqual(rows.filter((r) => r.kind === 'season').map((r) => [r.label, r.checked]),
    [['None', false], ['Winter', true], ['Christmas', true], ['Autumn', false]], 'both are marked until one is picked');
  assert.deepStrictEqual(rows.filter((r) => r.kind === 'theme').map((r) => r.label), ['Glow', 'Mine']);
  const quiet = plainRows(P.lookRows(null, lookWith({ style: 'smoke', themes: ['glow'], auto: true, skip: [] }, themes)));
  assert.strictEqual(quiet.find((r) => r.kind === 'auto').hint, 'Nothing is in season today');
});
