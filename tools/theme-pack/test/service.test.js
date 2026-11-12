const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = path.join(__dirname, '..');

// The service as the package installs it: service.js next to its exported packs and a writable data/, with a stand-in
// for webos-service that records the registered methods so a test can call them as the bus would.
// `themes` replaces the exported theme packs with the given ones; `look` is a data/look.json from an earlier run.
function start(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-service-'));
  fs.copyFileSync(path.join(dir, 'service', 'service.js'), path.join(root, 'service.js'));
  execFileSync('node', [path.join(dir, 'export-json.mjs'), path.join(root, 'packs')]);
  fs.mkdirSync(path.join(root, 'data'));
  if (opts && opts.themes) {
    const at = path.join(root, 'packs', 'themes');
    for (const f of fs.readdirSync(at)) fs.unlinkSync(path.join(at, f));
    for (const t of opts.themes) fs.writeFileSync(path.join(at, t.id + '.json'), JSON.stringify(t));
  }
  if (opts && opts.look) fs.writeFileSync(path.join(root, 'data', 'look.json'), JSON.stringify(opts.look));
  const fake = path.join(root, 'node_modules', 'webos-service');
  fs.mkdirSync(fake, { recursive: true });
  fs.writeFileSync(path.join(fake, 'index.js'), [
    'function Service(id) { this.id = id; this.methods = {}; this.activityManager = { create: function () {} }; Service.last = this; }',
    'Service.prototype.register = function (name, onCall, onCancel) { this.methods[name] = { onCall: onCall, onCancel: onCancel }; };',
    'module.exports = Service;'
  ].join('\n'));
  require(path.join(root, 'service.js'));
  const svc = require(path.join(fake, 'index.js')).last;
  let token = 0;
  // Calls a method; returns every answer it gets, including later ones to a subscription.
  function call(name, payload, subscribe) {
    const answers = [];
    svc.methods[name].onCall({ payload: payload || {}, isSubscription: !!subscribe, uniqueToken: String(++token),
      respond: (m) => answers.push(JSON.parse(JSON.stringify(m))) });
    return answers;
  }
  const kept = path.join(root, 'data', 'clock');
  return { call, saved: () => JSON.parse(fs.readFileSync(path.join(root, 'data', 'look.json'), 'utf8')),
    keptTime: () => (fs.existsSync(kept) ? fs.readFileSync(kept, 'utf8') : null) };
}

test('the service is ES5, for the TV\'s Node 0.12', () => {
  const lint = require('./lib/qml-compat.js');
  const f = path.join(dir, 'service', 'service.js');
  assert.deepStrictEqual(lint.checkSource(fs.readFileSync(f, 'utf8'), f, () => false), []);
});

const tick = () => new Promise((r) => setTimeout(r, 2));

test('openSettings tells subscribers which page to open, with a new `at` each time', async () => {
  const { call } = start();
  const sub = call('getLook', {}, true);
  assert.deepStrictEqual(sub[0].settings, { open: false, target: '', at: 0 });

  const opened = call('openSettings', { target: 'PictureMode' });
  assert.strictEqual(opened[0].returnValue, true);
  assert.strictEqual(sub.length, 2);
  assert.strictEqual(sub[1].settings.open, true);
  assert.strictEqual(sub[1].settings.target, 'PictureMode');
  assert.ok(sub[1].settings.at > 0);

  await tick();
  call('openSettings', {});
  assert.deepStrictEqual([sub[2].settings.open, sub[2].settings.target], [true, '']);
  assert.ok(sub[2].settings.at > sub[1].settings.at, 'the same request again is a new request');
});

test('closeSettings marks Settings closed and clears the target', async () => {
  const { call } = start();
  const sub = call('getLook', {}, true);
  call('openSettings', { target: 'Bluetooth' });
  await tick();
  call('closeSettings');
  const last = sub[sub.length - 1].settings;
  assert.deepStrictEqual([last.open, last.target], [false, '']);
  assert.ok(last.at > sub[1].settings.at);
});

test('openSettings refuses a target that is not a page id', () => {
  const { call } = start();
  const sub = call('getLook', {}, true);
  const r = call('openSettings', { target: 3 });
  assert.strictEqual(r[0].returnValue, false);
  assert.strictEqual(sub.length, 1, 'subscribers hear nothing');
});

test('getTelemetry says active only while the telemetry-off blackhole is live and not switched off', () => {
  const kit = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-off-'));
  const hosts = path.join(kit, 'hosts');
  const marker = fs.readFileSync(path.join(dir, '..', 'telemetry-off', 'telemetry-off.sh'), 'utf8').match(/^MARKER="(.*)"$/m)[1];
  process.env.TELEMETRY_OFF_DIR = path.join(kit, 'kit');
  process.env.TELEMETRY_OFF_HOSTS = hosts;
  try {
    const { call } = start();
    const kitState = () => call('getTelemetry')[0].kit;
    assert.strictEqual(kitState(), 'unknown', 'no kit, no hosts file');
    fs.writeFileSync(hosts, '127.0.0.1 localhost\n');
    assert.strictEqual(kitState(), 'unknown', 'no kit visible');
    fs.writeFileSync(hosts, '127.0.0.1 localhost\n' + marker + ' (3 names)\n');
    assert.strictEqual(kitState(), 'unknown', 'a marker with no kit visible (a jail\'s stale copy) proves nothing');
    fs.writeFileSync(hosts, '127.0.0.1 localhost\n');
    fs.mkdirSync(path.join(kit, 'kit', 'state'), { recursive: true });
    assert.strictEqual(kitState(), 'inactive', 'kit installed, blackhole not mounted');
    fs.writeFileSync(hosts, '127.0.0.1 localhost\n' + marker + ' (3 names)\n0.0.0.0 example.invalid\n');
    assert.strictEqual(kitState(), 'active');
    fs.writeFileSync(path.join(kit, 'kit', 'state', 'applying'), '');
    assert.strictEqual(kitState(), 'inactive', 'a run in progress');
    fs.rmSync(path.join(kit, 'kit', 'state', 'applying'));
    fs.writeFileSync(path.join(kit, 'kit', 'disabled'), '');
    assert.strictEqual(kitState(), 'inactive', 'the off switch');
  } finally {
    delete process.env.TELEMETRY_OFF_DIR;
    delete process.env.TELEMETRY_OFF_HOSTS;
  }
});

test('setProbe keeps the latest state per part, without telling Look subscribers', () => {
  const { call } = start();
  call('setProbing', { on: true });
  const sub = call('getLook', {}, true);
  call('setProbe', { from: 'parts/Settings.qml', state: { menu: { open: true } } });
  call('setProbe', { from: 'parts/Settings.qml', state: { menu: { open: false } }, layer: '17' });
  call('setProbe', { from: 'parts/Toast.qml', state: { shown: true, message: 'hi' } });
  const answer = call('getProbe')[0];
  const probes = answer.probes;
  assert.match(answer.now, /^\d{4}-\d\d-\d\dT/, 'the service says its own time, for the probes\' age');
  assert.strictEqual(probes['parts/Settings.qml'].seq, 2, 'a sequence per part');
  assert.deepStrictEqual(probes['parts/Settings.qml'].state, { menu: { open: false } });
  assert.strictEqual(probes['parts/Toast.qml'].state.message, 'hi');
  assert.match(probes['parts/Toast.qml'].at, /^\d{4}-\d\d-\d\dT/);
  assert.strictEqual(sub.length, 1);
});

test('getProbe answers the layer instance that sent each probe', () => {
  const { call } = start();
  call('setProbing', { on: true });
  call('setProbe', { from: 'parts/Toast.qml', state: { shown: false }, layer: 'abc' });
  assert.strictEqual(call('getProbe')[0].probes['parts/Toast.qml'].layer, 'abc');
});

test('probing is off at start, tells the layer through the Look subscription, refuses probes while off, and expires', async () => {
  const { call } = start();
  const sub = call('getLook', {}, true);
  assert.strictEqual(sub[0].probing, false, 'off by default');
  assert.strictEqual(call('setProbe', { from: 'parts/Toast.qml', state: {} })[0].returnValue, false, 'no probe is kept while off');
  assert.deepStrictEqual(call('getProbe')[0].probes, {});
  assert.strictEqual(call('setProbing', { on: 'yes' })[0].returnValue, false);
  const on = call('setProbing', { on: true, seconds: 0.08 })[0];
  assert.deepStrictEqual([on.returnValue, on.probing], [true, true]);
  assert.strictEqual(sub[sub.length - 1].probing, true, 'subscribers (the layer) hear it');
  call('setProbe', { from: 'parts/Toast.qml', state: { shown: false } });
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(call('getProbe')[0].probing, true, 'a read keeps it on');
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(call('getProbe')[0].probing, true);
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(sub[sub.length - 1].probing, false, 'unread, it turns itself off and says so');
  const g = call('getProbe')[0];
  assert.deepStrictEqual([g.probing, g.probes], [false, {}], 'and its probes are gone');
  call('setProbing', { on: true });
  call('setProbing', { on: false });
  assert.strictEqual(sub[sub.length - 1].probing, false);
  assert.ok(!require('node:fs').readFileSync(require('node:path').join(dir, 'service', 'service.js'), 'utf8').match(/probing[^\n]*writeFileSync/), 'never written to disk');
});

// The calendar. These run on a clock the test sets, at local noon, so they hold in any time zone.
const noon = (y, m, d) => new Date(y, m - 1, d, 12).getTime();
const HOUR = 3600000;
function clock(t, y, m, d) { t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: noon(y, m, d) }); }
const seasonal = (id, season) => ({ id, name: id, group: 'seasonal', season, decorate: [] });
const sample = [
  { id: 'glow', name: 'Glow', decorate: [] },
  seasonal('winter', [{ from: '12-01', to: '03-19' }]),
  seasonal('autumn', [{ from: '09-23', to: '11-30' }]),
  seasonal('christmas', [{ from: '12-01', to: '12-25' }]),
  seasonal('newyear', [{ from: '12-26', to: '01-03' }]),
  seasonal('halloween', [{ from: '10-17', to: '10-31' }]),
  seasonal('thanksgiving', [{ rule: 'weekday', month: 11, weekday: 4, nth: 4, before: 7 }]),
  seasonal('easter', [{ rule: 'easter', before: 7, after: 1 }]),
  seasonal('hanukkah', [{ rule: 'hanukkah' }])
];
const listed = (answer) => answer.available.themes;
const datesOf = (answer, id) => listed(answer).find((x) => x.id === id).dates;

test('the theme listing passes on group and season, and orders seasonal themes by the calendar', (t) => {
  clock(t, 2026, 11, 11);
  const { call } = start({ themes: sample });
  const got = call('getLook')[0];
  assert.strictEqual(got.today, '2026-11-11');
  assert.deepStrictEqual(listed(got).map((x) => x.id),
    ['glow', 'winter', 'newyear', 'easter', 'autumn', 'halloween', 'thanksgiving', 'christmas', 'hanukkah']);
  assert.deepStrictEqual(listed(got)[0], { id: 'glow', name: 'Glow', description: '', group: 'custom' });
  const autumn = listed(got).find((x) => x.id === 'autumn');
  assert.deepStrictEqual(autumn, { id: 'autumn', name: 'autumn', description: '', group: 'seasonal',
    season: [{ from: '09-23', to: '11-30' }], dates: [{ from: '2026-09-23', to: '2026-11-30' }], inSeason: true });
  // A window that has passed gives its next run; one that crosses New Year ends in the next year.
  assert.deepStrictEqual(datesOf(got, 'halloween'), [{ from: '2027-10-17', to: '2027-10-31' }]);
  assert.deepStrictEqual(datesOf(got, 'newyear'), [{ from: '2026-12-26', to: '2027-01-03' }]);
  assert.strictEqual(listed(got).find((x) => x.id === 'winter').inSeason, false);
});

test('the days that move are worked out for the year: Thanksgiving, Easter, Hanukkah', (t) => {
  const cases = [
    // year, Thanksgiving, Easter Sunday, first day of Hanukkah
    [2024, '2024-11-28', '2024-03-31', '2024-12-26'],
    [2025, '2025-11-27', '2025-04-20', '2025-12-15'],
    [2026, '2026-11-26', '2026-04-05', '2026-12-05'],
    [2027, '2027-11-25', '2027-03-28', '2027-12-25'],
    [2030, '2030-11-28', '2030-04-21', '2030-12-21'],
    [2038, '2038-11-25', '2038-04-25', '2038-12-22']
  ];
  const day = (iso, by) => new Date(Date.parse(iso + 'T00:00:00Z') + by * 86400000).toISOString().slice(0, 10);
  for (const [year, thanksgiving, easter, hanukkah] of cases) {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: noon(year, 2, 1) });
    const got = start({ themes: sample }).call('getLook')[0];
    assert.deepStrictEqual(datesOf(got, 'thanksgiving'), [{ from: day(thanksgiving, -7), to: thanksgiving }], 'Thanksgiving ' + year);
    assert.deepStrictEqual(datesOf(got, 'easter'), [{ from: day(easter, -7), to: day(easter, 1) }], 'Easter ' + year);
    assert.deepStrictEqual(datesOf(got, 'hanukkah'), [{ from: hanukkah, to: day(hanukkah, 7) }], 'Hanukkah ' + year);
    t.mock.timers.reset();
  }
});

test('Hanukkah starts on 25 Kislev in every year the TV could see', (t) => {
  const hebrew = new Intl.DateTimeFormat('en-u-ca-hebrew', { timeZone: 'UTC', day: 'numeric', month: 'long' });
  if (!/Kislev/.test(hebrew.format(new Date(Date.UTC(2026, 11, 5))))) return t.skip('this Node has no Hebrew calendar');
  for (let year = 2020; year <= 2099; year++) {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: noon(year, 6, 1) });
    const from = datesOf(start({ themes: [seasonal('hanukkah', [{ rule: 'hanukkah' }])] }).call('getLook')[0], 'hanukkah')[0].from;
    assert.strictEqual(hebrew.format(new Date(from + 'T00:00:00Z')), '25 Kislev', String(year));
    t.mock.timers.reset();
  }
});

test('auto turns on the season and one holiday that cover today, and keeps the other themes', (t) => {
  clock(t, 2026, 11, 11);
  const { call, saved } = start({ themes: sample, look: { themes: ['halloween', 'glow'] } });
  const sub = call('getLook', {}, true);
  assert.deepStrictEqual(sub[0].look, { style: sub[0].look.style, themes: ['halloween', 'glow'], auto: false, skip: [] });

  const on = call('setLook', { auto: true })[0];
  assert.strictEqual(on.returnValue, true);
  assert.deepStrictEqual(on.look.themes, ['glow', 'autumn'], 'Halloween is out of its window; autumn is in');
  assert.deepStrictEqual(on.themes.map((x) => x.id), ['glow', 'autumn']);
  assert.strictEqual(saved().auto, true);
  assert.strictEqual(sub.length, 2);

  // A theme asked for by hand while auto is on: the calendar still owns the seasonal ones.
  assert.deepStrictEqual(call('setLook', { themes: ['christmas'] })[0].look.themes, ['autumn']);
  // Off again: the look stays as the calendar left it, and is the household's to change.
  assert.deepStrictEqual(call('setLook', { auto: false, themes: ['glow', 'autumn'] })[0].look.themes, ['glow', 'autumn']);
  assert.deepStrictEqual(call('setLook', { themes: ['christmas'] })[0].look.themes, ['christmas']);
});

test('a season lies under its holiday; of two holidays the shorter window wins', (t) => {
  clock(t, 2026, 12, 6);
  const { call } = start({ themes: sample });
  // 6 December 2026: winter, Christmas (25 days) and Hanukkah (8 days) all cover the day.
  assert.deepStrictEqual(call('setLook', { auto: true })[0].look.themes, ['winter', 'hanukkah']);
  assert.deepStrictEqual(call('setLook', { skip: ['hanukkah'] })[0].look.themes, ['winter', 'christmas']);
  assert.deepStrictEqual(call('setLook', { skip: ['hanukkah', 'winter'] })[0].look.themes, ['christmas']);
  assert.deepStrictEqual(call('setLook', { skip: ['hanukkah', 'winter', 'christmas'] })[0].look.themes, []);
  const back = call('setLook', { skip: [] })[0];
  assert.deepStrictEqual([back.look.themes, back.look.skip], [['winter', 'hanukkah'], []]);
});

test('the calendar is read again when the day turns, and subscribers hear only when something changed', (t) => {
  clock(t, 2026, 11, 25);
  const { call, saved } = start({ themes: sample, look: { auto: true, themes: ['glow'] } });
  const sub = call('getLook', {}, true);
  assert.deepStrictEqual(sub[0].look.themes, ['glow', 'autumn', 'thanksgiving'], 'read at start');
  assert.deepStrictEqual(saved().themes, ['glow', 'autumn', 'thanksgiving']);

  t.mock.timers.tick(24 * HOUR);
  assert.strictEqual(sub.length, 1, '26 November: the same themes, the same dates, nothing to say');
  t.mock.timers.tick(24 * HOUR);
  assert.deepStrictEqual(sub[1].look.themes, ['glow', 'autumn'], '27 November: Thanksgiving is over');
  assert.strictEqual(sub[1].today, '2026-11-27');
  assert.deepStrictEqual(datesOf(sub[1], 'thanksgiving'), [{ from: '2027-11-18', to: '2027-11-25' }]);
  for (let i = 0; i < 4; i++) t.mock.timers.tick(24 * HOUR);
  assert.deepStrictEqual(sub[sub.length - 1].look.themes, ['glow', 'winter', 'christmas'], '1 December');
  assert.deepStrictEqual(saved().themes, ['glow', 'winter', 'christmas']);
  for (let i = 0; i < 31; i++) t.mock.timers.tick(24 * HOUR);
  assert.deepStrictEqual(sub[sub.length - 1].look.themes, ['glow', 'winter', 'newyear'], '1 January, across New Year');
  for (let i = 0; i < 3; i++) t.mock.timers.tick(24 * HOUR);
  assert.deepStrictEqual(sub[sub.length - 1].look.themes, ['glow', 'winter'], '4 January');
});

test('the time is written down each minute for the next boot, but not a clock nobody has set', (t) => {
  // The service's file is as old as this run, so 2019 is before it and 2031 after it.
  clock(t, 2019, 1, 1);
  const { keptTime } = start({ themes: sample });
  t.mock.timers.tick(60000);
  assert.strictEqual(keptTime(), null, 'the clock a boot starts with is not kept');

  t.mock.timers.setTime(noon(2031, 3, 9));
  t.mock.timers.tick(60000);
  assert.strictEqual(keptTime(), String(Math.floor(Date.now() / 1000)), 'seconds since 1970');
  const first = Number(keptTime());
  t.mock.timers.tick(60000);
  assert.strictEqual(Number(keptTime()), first + 60, 'and again a minute on');
});

test('a clock set after the service started is heard within a minute, and a clock set back is followed too', (t) => {
  // The TV has no battery clock: it starts in 2019, and its date arrives later (from the network, or set by hand).
  clock(t, 2019, 1, 1);
  const { call, saved } = start({ themes: sample, look: { auto: true, themes: ['glow'] } });
  const sub = call('getLook', {}, true);
  assert.deepStrictEqual(sub[0].look.themes, ['glow', 'winter', 'newyear'], 'the day it believes at start');

  t.mock.timers.setTime(noon(2026, 11, 11));
  assert.strictEqual(sub.length, 1, 'nothing runs the moment the clock moves');
  t.mock.timers.tick(60000);
  assert.strictEqual(sub.length, 2);
  assert.deepStrictEqual([sub[1].today, sub[1].look.themes], ['2026-11-11', ['glow', 'autumn']]);
  assert.deepStrictEqual(saved().themes, ['glow', 'autumn']);

  t.mock.timers.tick(10 * 60000);
  assert.strictEqual(sub.length, 2, 'a day that has not turned says nothing');

  // Set back (the mocked timers are due by the mocked date, so here it is a call that sees it).
  t.mock.timers.setTime(noon(2025, 12, 24));
  const got = call('getLook')[0];
  assert.deepStrictEqual([got.today, got.look.themes], ['2025-12-24', ['glow', 'winter', 'christmas']]);
  assert.deepStrictEqual(sub[2].look.themes, ['glow', 'winter', 'christmas'], 'and subscribers hear it');
});

test('with auto off the calendar changes no theme, and a day that turned unseen is caught up on the next call', (t) => {
  clock(t, 2026, 10, 31);
  const { call } = start({ themes: sample, look: { themes: ['halloween'] } });
  const sub = call('getLook', {}, true);
  t.mock.timers.tick(24 * HOUR);
  assert.deepStrictEqual(sub[sub.length - 1].look.themes, ['halloween'], 'a theme picked by hand stays');
  assert.strictEqual(listed(sub[sub.length - 1]).find((x) => x.id === 'halloween').inSeason, false);

  // The clock jumps (set late after a boot, or a long sleep) with no timer run: the next call sees the new day.
  t.mock.timers.setTime(noon(2026, 12, 24));
  const got = call('setLook', { auto: true })[0];
  assert.strictEqual(got.today, '2026-12-24');
  assert.deepStrictEqual(got.look.themes, ['winter', 'christmas']);
});

test('setLook refuses an auto that is not a boolean and a skip that is not a list of seasonal themes', (t) => {
  clock(t, 2026, 11, 11);
  const { call } = start({ themes: sample });
  const sub = call('getLook', {}, true);
  for (const bad of [{ auto: 'yes' }, { auto: 1 }, { skip: 'winter' }, { skip: ['glow'] }, { skip: ['nothing'] }]) {
    const r = call('setLook', bad)[0];
    assert.strictEqual(r.returnValue, false, JSON.stringify(bad));
    assert.ok(r.errorText);
  }
  assert.strictEqual(sub.length, 1, 'subscribers hear nothing');
});

test('a seasonal pack with a window the service cannot read is said so, and one with none is a custom theme', (t) => {
  clock(t, 2026, 11, 11);
  const { call } = start({ themes: [
    seasonal('half', [{ from: '11-01', to: '11-30' }, { from: '13-01', to: '13-09' }]),
    seasonal('lost', [{ rule: 'solstice' }]),
    seasonal('empty', []),
    { id: 'odd', name: 'odd', group: 'seasonal', season: [{ from: '02-30', to: '03-01' }, { rule: 'easter', before: -1 },
      { rule: 'weekday', month: 11, weekday: 7, nth: 4 }, { from: '03-01', to: '03-09', before: 2 }], decorate: [] }
  ] });
  const got = call('getLook')[0];
  assert.deepStrictEqual(listed(got).map((x) => [x.id, x.group]),
    [['empty', 'custom'], ['lost', 'custom'], ['odd', 'custom'], ['half', 'seasonal']]);
  assert.deepStrictEqual(datesOf(got, 'half'), [{ from: '2026-11-01', to: '2026-11-30' }]);
  const said = call('getReports')[0].reports.filter((r) => r.from === 'service').map((r) => r.kind + ' ' + r.text.split(':')[0]);
  assert.deepStrictEqual(said.sort(), ['error theme empty', 'error theme lost', 'error theme odd', 'gap theme half']);
});

test('every theme pack names a known group, and every seasonal pack gives windows the service reads', (t) => {
  clock(t, 2026, 11, 11);
  const { call } = start();
  const keys = { fixed: ['from', 'to'], easter: ['after', 'before', 'rule'], hanukkah: ['after', 'before', 'rule'],
                 weekday: ['after', 'before', 'month', 'nth', 'rule', 'weekday'] };
  const got = call('getLook')[0];
  for (const f of fs.readdirSync(path.join(dir, 'packs', 'themes'))) {
    const pack = require(path.join(dir, 'packs', 'themes', f));
    const item = listed(got).find((x) => x.id === pack.id);
    // No group is a custom theme.
    assert.ok(pack.group === undefined || pack.group === 'seasonal' || pack.group === 'custom', pack.id + ': group ' + pack.group);
    if (pack.group !== 'seasonal') {
      assert.strictEqual(pack.season, undefined, pack.id + ': only a seasonal theme has a season');
      assert.strictEqual(item.group, 'custom');
      continue;
    }
    assert.ok(Array.isArray(pack.season) && pack.season.length > 0, pack.id + ': a seasonal theme needs a season');
    for (const w of pack.season) {
      const allowed = keys[w.rule === undefined ? 'fixed' : w.rule];
      assert.ok(allowed, pack.id + ': unknown rule ' + w.rule);
      for (const k of Object.keys(w)) assert.ok(allowed.includes(k), pack.id + ': season key ' + k);
    }
    assert.strictEqual(item.group, 'seasonal', pack.id);
    assert.strictEqual(item.dates.length, pack.season.length, pack.id + ': every window read');
  }
  assert.deepStrictEqual(call('getReports')[0].reports.filter((r) => r.from === 'service'), []);
});
