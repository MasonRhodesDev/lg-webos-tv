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
});
