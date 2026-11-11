const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The TV suite (tv-suite/), offline: the key guard, the TV-CHECKS coverage map, the board renderer's expansion, and
// the suite's dry run against the fake TV: deploy through the real scripts (fake ssh and scp first on PATH), every
// scenario in process, and the faults the suite must catch.
const dir = path.join(__dirname, '..', 'tv-suite');
const imp = (f) => import(path.join(dir, f));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-test-' + p + '-'));

async function dryRun(over = {}, ids) {
  const fake = await imp('fake/tv.mjs');
  const { makeTv } = await imp('lib/tv.mjs');
  const { makeCtx, runScenarios } = await imp('lib/run.mjs');
  const { SCENARIOS } = await imp('lib/scenarios.mjs');
  const state = fake.deployedState(over);
  const out = tmp('run');
  // Each dry run keeps its journal pointer to itself (a failed restore leaves a journal open, on purpose).
  process.env.TV_SUITE_STATE = tmp('state');
  const lines = [];
  const tv = makeTv({ host: 'tv.invalid', exec: fake.inProcess(state) });
  const ctx = makeCtx({ tv, out, say: (l) => lines.push(l), poll: 10, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30))) });
  const r = await runScenarios(ctx, ids ? SCENARIOS.filter((s) => ids.includes(s.id)) : SCENARIOS.filter((s) => !s.optIn));
  return { r, state, out, lines, run: (id) => r.runs.find((x) => x.id === id) };
}

test('the guard lets through only keys that change nothing', async () => {
  const { guard, KEYS } = await imp('lib/keys.mjs');
  const menu = (focus, extra) => ({ settings: { quick: { open: false }, menu: Object.assign({ open: true, area: 'page', stack: ['Picture'], focus }, extra) } });
  const quick = (focus) => ({ settings: { menu: { open: false }, quick: { open: true, stack: ['quick'], focus } } });
  const row = (kind, variant, label = 'x') => ({ kind, variant, label });
  assert.strictEqual(guard('ENTER', menu(row('item', 'value'))), null, 'OK on a value opens its picker');
  assert.strictEqual(guard('ENTER', menu(row('page', 'nav'))), null);
  assert.strictEqual(guard('ENTER', quick(row('settings', 'nav'))), null, 'All settings');
  assert.match(guard('ENTER', menu(row('item', 'toggle'))), /would change/);
  assert.match(guard('ENTER', menu(row('action', 'nav', 'Reset to initial settings'))), /would change/);
  assert.match(guard('ENTER', menu(row('choose', 'choice'))), /would change/, 'OK in a picker chooses');
  assert.match(guard('ENTER', menu(row('network', 'action'))), /would change/);
  assert.match(guard('ENTER', menu(row('changePin', 'nav'))), /would change/);
  assert.match(guard('ENTER', menu(Object.assign(row('page', 'nav'), { locked: true }))), /PIN/);
  assert.match(guard('ENTER', menu(row('text', 'value'))), /would change/);
  assert.strictEqual(guard('ENTER', menu(row('text', 'value')), { text: true }), null, 'the keyboard opens only when asked');
  assert.match(guard('ENTER', menu(row('style', 'choice'))), /would change/);
  assert.strictEqual(guard('ENTER', menu(row('theme', 'toggle')), { look: true }), null);
  assert.match(guard('LEFT', menu(row('item', 'slider'))), /step/);
  assert.match(guard('RIGHT', menu(row('item', 'value'))), /slider/);
  assert.strictEqual(guard('LEFT', menu(row('item', 'value'))), null, 'Left goes back a page');
  assert.match(guard('LEFT', quick(row('item', 'value'))), /volume/);
  assert.strictEqual(guard('RIGHT', menu(row('', 'category'), { area: 'categories' })), null);
  assert.match(guard('ENTER', menu(row('item', 'value'), { dialog: true })), /dialog/);
  assert.match(guard('ENTER', menu(null, { editing: { label: 'TV name', length: 0 } })), /keyboard/);
  assert.strictEqual(guard('BACK', menu(null, { editing: { label: 'TV name', length: 0 } })), null);
  const pin = (mode) => menu(null, { pin: { mode, length: 0, error: '', pad: 0 } });
  assert.match(guard('ENTER', pin('page')), /PIN scenario/);
  assert.strictEqual(guard('ENTER', pin('page'), { pin: true }), null);
  assert.match(guard('ENTER', pin('new'), { pin: true }), /only BACK/, 'never on a new-PIN prompt');
  const none = { settings: { quick: { open: false }, menu: { open: false } }, systemUi: '' };
  for (const k of ['UP', 'DOWN', 'ENTER', 'LEFT', 'BACK']) assert.match(guard(k, none), /nothing of ours is confirmed open/, k + ': BACK too, only with our menu open');
  assert.strictEqual(guard('QMENU', none), null);
  for (const k of ['ENTER', 'RIGHT', 'BACK', 'QMENU']) {
    assert.match(guard(k, Object.assign({}, none, { picker: { shown: true } })), /input picker is open: no key/, 'picker ' + k);
    assert.match(guard(k, Object.assign({}, none, { systemUi: 'com.webos.app.quicksettings' })), /LG's Quick Settings is open: no key/, 'LG QS ' + k);
  }
  // A stale probe (the layer may be gone): nothing, not even BACK to our menu.
  const stale = Object.assign({}, menu(row('item', 'value')), { fresh: false, stale: "our Settings' probe is 30.0 s old" });
  for (const k of ['BACK', 'QMENU', 'DOWN']) assert.match(guard(k, stale), /stale state, nothing is pressed/, 'stale ' + k);
  for (const k of ['HOME', 'EXIT', 'INPUT_HUB', 'POWER', 'CHANNELUP', '0']) assert.match(guard(k, none), /never pressed/, k);
  assert.match(guard('VOLUMEUP', none), /volume scenarios/);
  // Reversible writes: only the named setting, only its toggle or picker choice; actions never.
  const toggle = Object.assign(row('item', 'toggle', 'Quick Start+'), { ref: 'quickStartMode' });
  assert.strictEqual(guard('ENTER', menu(toggle), { write: { ref: 'quickStartMode' } }), null);
  assert.match(guard('ENTER', menu(toggle), { write: { ref: 'autoVolume' } }), /would change/);
  assert.strictEqual(guard('ENTER', menu(Object.assign(row('choose', 'choice'), { ref: 'pictureMode' })), { write: { ref: 'pictureMode' } }), null);
  assert.match(guard('ENTER', menu(Object.assign(row('action', 'nav'), { ref: 'resetToInitial' })), { write: { ref: 'resetToInitial' } }), /would change/);
  assert.match(guard('ENTER', menu(Object.assign(row('changePin', 'nav'), { ref: 'systemPin' })), { write: { ref: 'systemPin' } }), /would change/);
  const vol = Object.assign(row('item', 'slider', 'Volume'), { ref: 'volume' });
  assert.strictEqual(guard('RIGHT', quick(vol), { write: { ref: 'volume' } }), null);
  assert.match(guard('RIGHT', quick(vol)), /volume/);
  const kb = (label) => menu(null, { editing: { label, length: 3 } });
  assert.strictEqual(guard('LEFT', kb('TV name'), { type: true }), null);
  assert.strictEqual(guard('ENTER', kb('TV name'), { type: true }), null);
  assert.match(guard('ENTER', kb('Password for Home'), { type: true }), /password/);
  assert.strictEqual(guard('VOLUMEUP', none, { volume: true }), null);
  assert.match(guard('NOSUCHKEY', none), /unknown/);
  const odd = Object.assign({}, menu(row('item', 'value')), { systemUi: 'unknown' });
  for (const k of ['QMENU', 'UP', 'ENTER', 'LEFT', 'BACK']) assert.match(guard(k, odd), /LG overlay we do not know/, k + ' with systemUIManager unreadable');
  assert.ok(Object.keys(KEYS).every((k) => ['proven', 'table', 'unverified'].includes(KEYS[k].from)));
  // Home and Exit only with their own allowance, never through another; nothing else that is never pressed has one.
  const deep = menu(row('page', 'nav', 'Legal notice'));
  assert.strictEqual(guard('EXIT', deep, { exit: true }), null);
  assert.strictEqual(guard('HOME', deep, { home: true }), null);
  assert.strictEqual(guard('HOME', none, { home: true }), null, 'Home over the app, for its capture');
  assert.match(guard('HOME', deep, { exit: true, write: { ref: 'x' }, over: 'com.webos.app.home' }), /never pressed/);
  assert.match(guard('EXIT', stale, { exit: true }), /stale state/);
  assert.match(guard('HOME', Object.assign({}, none, { systemUi: 'com.webos.app.quicksettings' }), { home: true }), /LG's Quick Settings is open/);
  for (const k of ['INPUT_HUB', 'POWER', 'CHANNELUP', 'CHANNELDOWN', '0']) {
    assert.match(guard(k, deep, { home: true, exit: true, picker: true, lgQuick: true, over: 'x', launch: { ref: 'deviceConnector' } }), /never pressed/, k);
  }
  // OK on an action row that only opens LG's app, named; never on another action, whatever is named.
  const leave = (ref) => menu(Object.assign(row('action', 'nav', ref), { ref }));
  assert.strictEqual(guard('ENTER', leave('deviceConnector'), { launch: { ref: 'deviceConnector' } }), null);
  assert.match(guard('ENTER', leave('deviceConnector'), { launch: { ref: 'pictureTest' } }), /would change/);
  assert.match(guard('ENTER', leave('deviceConnector')), /would change/);
  assert.match(guard('ENTER', leave('resetToInitial'), { launch: { ref: 'resetToInitial' } }), /would change/);
  assert.match(guard('ENTER', leave('screenOff'), { launch: { ref: 'screenOff' } }), /would change/);
  // The input picker: Left, Right and Back when allowed, never OK; LG's Quick Settings: moves, OK and Back.
  const pk = Object.assign({}, none, { picker: { shown: true } });
  for (const k of ['LEFT', 'RIGHT', 'BACK']) assert.strictEqual(guard(k, pk, { picker: true }), null, 'picker ' + k);
  for (const k of ['ENTER', 'UP', 'QMENU']) assert.match(guard(k, pk, { picker: true }), /only Left, Right and Back/, 'picker ' + k);
  const lgqs = Object.assign({}, none, { systemUi: 'com.webos.app.quicksettings' });
  for (const k of ['UP', 'DOWN', 'ENTER', 'BACK']) assert.strictEqual(guard(k, lgqs, { lgQuick: true }), null, 'LG QS ' + k);
  for (const k of ['LEFT', 'RIGHT', 'QMENU']) assert.match(guard(k, lgqs, { lgQuick: true }), /LG's Quick Settings is open/, 'LG QS ' + k);
  // Back over LG's app only while that app is in front and nothing of ours is open.
  assert.strictEqual(guard('BACK', Object.assign({}, none, { front: ['com.webos.app.hdmi2', 'com.webos.app.home'] }), { over: 'com.webos.app.home' }), null);
  assert.match(guard('BACK', Object.assign({}, none, { front: ['com.webos.app.hdmi2'] }), { over: 'com.webos.app.home' }), /nothing of ours/);
  assert.match(guard('ENTER', Object.assign({}, none, { front: ['com.webos.app.home'] }), { over: 'com.webos.app.home' }), /nothing of ours/);
});

test('every TV-CHECKS item has exactly one coverage entry, and the scenarios name only known ones', async () => {
  const { coverage, COVERAGE } = await imp('lib/coverage.mjs');
  const { SCENARIOS } = await imp('lib/scenarios.mjs');
  const c = coverage();
  assert.ok(c.length >= 50, c.length + ' items');
  for (const x of c) assert.strictEqual(x.entries.length, 1, x.entries.length + ' entries for: ' + x.item.slice(0, 120));
  const used = new Set(c.map((x) => x.entries[0].id));
  for (const e of COVERAGE) {
    assert.ok(used.has(e.id), 'coverage entry ' + e.id + ' matches no item');
    assert.ok(['automated', 'partly', 'manual', 'not covered'].includes(e.how), e.id);
    if (e.how !== 'automated') assert.ok(e.reason, e.id + ' says why it is ' + e.how);
  }
  for (const s of SCENARIOS) for (const id of s.tvChecks) assert.ok(COVERAGE.some((e) => e.id === id), s.id + ' names ' + id);
  const ids = SCENARIOS.map((s) => s.id);
  const { CHECKLIST } = await imp('lib/manual.mjs');
  const manual = CHECKLIST.flatMap((g) => g.items);
  for (const e of COVERAGE.filter((x) => x.by)) {
    for (const by of e.by.split(/,\s*/)) {
      const [name, item] = by.split(' ');
      if (name === 'manual') assert.ok(manual.some((m) => m.id === item && m.covers.includes(e.id)), e.id + ': manual ' + item + ' does not cover it');
      else if (!['deploy', 'every', 'coldboot'].includes(name)) assert.ok(ids.includes(name), e.id + ' is covered by ' + name + ', which is no scenario');
    }
    if (e.how === 'manual') assert.match(e.by, /manual /, e.id + ' is manual: it needs a step in the manual pass');
  }
  for (const m of manual) {
    for (const id of m.covers) assert.ok(COVERAGE.some((e) => e.id === id), 'manual ' + m.id + ' covers unknown ' + id);
    assert.ok(m.press && m.look && m.pass, m.id + ' says what to press, look for and count as a pass');
  }
});

test('the board renderer expands loops, conditions, logic values and imports, and blanks the picture', async () => {
  const { expand } = await imp('lib/boards.mjs');
  const d = tmp('boards');
  const board = (body, script) => '<x-dc><helmet></helmet>' + body + '</x-dc><script type="text/x-dc" data-dc-script>' + script + '</script>';
  fs.writeFileSync(path.join(d, 'Frame.dc.html'), board('<p>{{ title }}</p><sc-if value="{{ wide }}"><b>wide</b></sc-if>',
    'class Component extends DCLogic { renderVals() { return { title: "Page " + this.props.page, wide: this.props.page === "sound" }; } }'));
  const html = expand(board('<img src="/_blob/abc"><sc-for list="{{ rows }}" as="r"><i>{{ r.label }}</i></sc-for><dc-import name="Frame" page="sound" hint-size="1px,1px"></dc-import>',
    'class Component extends DCLogic { renderVals() { return { rows: [{ label: "a" }, { label: "b" }] }; } }'), {}, d);
  assert.match(html, /<i>a<\/i><i>b<\/i>/);
  assert.match(html, /<p>Page sound<\/p><b>wide<\/b>/);
  assert.doesNotMatch(html, /_blob/);
});

test('keys.py is valid Python', { skip: spawnSync('python3', ['--version']).status !== 0 && 'no python3' }, () => {
  const r = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(open(sys.argv[1]).read())', path.join(dir, 'keys.py')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
});

test('dry run: deploy runs the real scripts against the fake TV, step by step, and stops at the exact reason', () => {
  const cli = path.join(dir, 'tv-suite.mjs');
  const deploy = (state, ...args) => {
    const f = path.join(tmp('deploy'), 'tv.json');
    if (state) fs.writeFileSync(f, JSON.stringify(state));
    const r = spawnSync(process.execPath, [cli, 'deploy', '--dry-run', '--fake-state', f, ...args], { encoding: 'utf8', timeout: 120000,
      env: Object.assign({}, process.env, { TV_HOST: '' }) });
    return { out: r.stdout + r.stderr, status: r.status, tv: JSON.parse(fs.readFileSync(f, 'utf8')) };
  };
  const ok = deploy(null);
  assert.strictEqual(ok.status, 0, ok.out);
  for (const s of ['look', 'layer', 'boot']) assert.match(ok.out, new RegExp('PASS ' + s));
  assert.match(ok.out, /rollback: TV_HOST=\$TV_HOST sh tools\/theme-pack\/webos\/install-boot\.sh remove/);
  assert.ok(ok.tv.installed && ok.tv.layer && ok.tv.mounted, 'the fake TV has the package, the layer and the stub');
  assert.deepStrictEqual(ok.tv.unknown, [], 'every command the scripts sent is one the fake knows');
  assert.deepStrictEqual(ok.tv.events, []);
  const again = deploy(ok.tv);
  assert.strictEqual(again.status, 0, 'deploying again works: ' + again.out);

  const base = JSON.parse(JSON.stringify(ok.tv));
  const fresh = Object.assign({}, base, { installed: false, layer: false, layerFiles: false, stub: false, hook: false, mounted: false, reports: [], themepackLog: '' });
  const hookA = deploy(Object.assign({}, fresh, { faults: { hookA: true } }));
  assert.strictEqual(hookA.status, 1);
  assert.match(hookA.out, /FAIL layer: settings: host up, but Hook A is not applied; not reporting ready/);
  assert.match(hookA.out, /rollback, newest first:\n {2}TV_HOST=\$TV_HOST sh tools\/theme-pack\/webos\/own-layer-tv\.sh revert\n {2}ssh root@\$TV_HOST/);
  assert.doesNotMatch(hookA.out, /== 3\/3/, 'it stops at the first failure');
  const broken = deploy(Object.assign({}, fresh, { faults: { layerFails: true } }));
  assert.match(broken.out, /FAIL layer: the layer did not load: no report from the new layer; the screen is left as it was/);
  const refused = deploy(Object.assign({}, fresh, { faults: { installFails: true } }));
  assert.match(refused.out, /FAIL look: the TV refused the package/);
  const noLayer = deploy(Object.assign({}, base, { layerFiles: false, layer: false, mounted: false }), '--only', 'boot');
  assert.match(noLayer.out, /FAIL boot: the boot hook: settings left stock \(the stub needs our layer and the Look service\)/);
});

// Our layer's open defects, as the fake models them from the TV: Exit and Home leave our Settings open, and so does
// leaving for LG's apps. Their scenarios fail on exactly these checks until the layer closes itself.
const DEFECTS = { 'exit-home': [/^EXIT closes our Settings/, /^HOME closes our Settings/], 'leave-for-lg': [/: our Settings gives way to LG's app$/] };

test('dry run: every scenario passes against the fake TV and leaves it as it was', async () => {
  const { r, state, out, lines, run } = await dryRun();
  for (const x of r.runs) {
    if (!DEFECTS[x.id]) { assert.strictEqual(x.status, 'pass', x.id + ': ' + x.reason + '\n' + lines.join('\n')); continue; }
    const bad = x.checks.filter((c) => !c.ok);
    assert.ok(bad.length && bad.every((c) => DEFECTS[x.id].some((d) => d.test(c.name))), x.id + ' fails on its known defect only: ' + bad.map((c) => c.name).join('; '));
  }
  for (const c of r.end) assert.ok(c.ok, c.name + ': ' + c.detail);
  assert.deepStrictEqual(state.events, [], 'nothing changed, switched, joined, paired or reached the app underneath');
  assert.deepStrictEqual(state.launched, ['com.webos.app.connectionwizard', 'com.webos.app.customersupport', 'com.webos.app.customersupport', 'org.webosbrew.hbchannel'],
    "LG's apps opened on purpose: the three leave-for-lg rows, and the stand-in for a streaming app");
  assert.strictEqual(state.fg, 'com.webos.app.hdmi2', 'the app in front is back');
  assert.ok(!state.home && !state.picker.shown && !state.quick.open && !state.menu.open, 'Home, the picker and our menus are put away');
  assert.deepStrictEqual(state.writes.slice().sort(), ['Network/deviceName', 'Network/deviceName', 'contrast', 'contrast', 'pictureMode', 'pictureMode', 'quickStartMode', 'quickStartMode', 'volume', 'volume'],
    'the four reversible writes, each made and undone through our UI');
  const initial = (await imp('fake/tv.mjs')).initialState();
  assert.deepStrictEqual(state.settings, initial.settings, 'every setting is as it was');
  assert.deepStrictEqual(state.unknown, []);
  assert.deepStrictEqual(state.look, { style: 'smoke', themes: ['halloween'] }, "the owner's look is back");
  assert.strictEqual(state.volume.volume, 12);
  assert.ok(run('quick-sheet').checks.some((c) => c.name === 'Picture mode unchanged' && c.ok));
  assert.ok(run('redirect-all').checks.length >= 57, 'every LG target');
  const caps = r.runs.flatMap((x) => x.captures);
  assert.ok(caps.length > 40);
  for (const c of caps) assert.ok(fs.existsSync(path.join(out, c.file)), c.file);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ started: '', finished: '', dry: true, runs: r.runs, end: r.end }));
  const { writeReport } = await imp('lib/report.mjs');
  const html = fs.readFileSync(await writeReport(out, {}), 'utf8');
  assert.match(html, /TV-CHECKS coverage/);
  assert.match(html, /board SmokeQuickSettings \(no --boards\)/);
  assert.ok(!html.includes(out), 'the sheet links its files relatively');
});

test('dry run: the suite catches BACK arriving as Backspace, a lingering stub, a stuck volume and a changed setting', async () => {
  const bs = await dryRun({ faults: { backIsBackspace: true } }, ['back-in-prompts']);
  assert.strictEqual(bs.run('back-in-prompts').status, 'fail');
  assert.match(bs.run('back-in-prompts').reason, /BACK left the keyboard up .*Backspace/);

  const stub = await dryRun({ faults: { stubLingers: true } }, ['redirect']);
  assert.ok(stub.run('redirect').checks.some((c) => !c.ok && /stub left running within 1 s/.test(c.name)));

  const vol = await dryRun({ faults: { volumeStuck: true } }, ['volume']);
  assert.strictEqual(vol.run('volume').status, 'fail');
  assert.match(vol.run('volume').reason, /timed out waiting for the volume to step/);

  const pick = await dryRun({ faults: { backChooses: true } }, ['picture-mode']);
  assert.strictEqual(pick.run('picture-mode').status, 'fail');
  assert.match(pick.run('picture-mode').reason, /left changed, then restored: pictureMode/);
  assert.strictEqual(pick.state.settings.pictureMode, 'expert1', 'and the suite put it back, read back');
  // A restore that does not stick is caught by the second read, not reported as done.
  const sticky = await dryRun({ faults: { backChooses: true, restoreIgnored: true } }, ['picture-mode']);
  assert.ok(sticky.run('picture-mode').checks.some((c) => !c.ok && /read back after the restore/.test(c.name) && /pictureMode: was "expert1", now/.test(c.detail)));

  const unmounted = await dryRun({ mounted: false }, ['redirect']);
  assert.strictEqual(unmounted.run('redirect').status, 'skip');
  assert.deepStrictEqual(unmounted.state.events, [], "LG's Settings is never launched without the stub");

  await assert.rejects(dryRun({ faults: { noProbe: true } }, ['toast']), /sends no probe for our Settings: deploy this branch first/);

  const muted = await dryRun({ volume: { volume: 12, muted: true, barUntil: 0, muteUntil: 0 } }, ['volume']);
  assert.strictEqual(muted.run('volume').status, 'skip');
});

test('the suite needs TV_HOST and never names a TV address', async () => {
  const { makeTv } = await imp('lib/tv.mjs');
  const was = process.env.TV_HOST;
  delete process.env.TV_HOST;
  assert.throws(() => makeTv(), /TV_HOST/);
  if (was !== undefined) process.env.TV_HOST = was;
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } })(dir);
  const { PORTABILITY } = await import(path.join(__dirname, '..', 'check-branch.mjs'));
  for (const f of files) for (const p of PORTABILITY) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), p.re, f + ': ' + p.name);
});

test('dry run from the command line: run writes its captures and results into OUT_DIR, report its sheet there', () => {
  const cli = path.join(dir, 'tv-suite.mjs'), out = tmp('cli'), f = path.join(tmp('cli-state'), 'tv.json');
  const cwd = tmp('cwd');
  const go = (...a) => spawnSync(process.execPath, [cli, ...a], { cwd, encoding: 'utf8', timeout: 120000 });
  const d = go('deploy', '--dry-run', '--fake-state', f);
  assert.strictEqual(d.status, 0, d.stdout + d.stderr);
  const r = go('run', out, '--dry-run', '--fake-state', f, '--scenario', 'toast', '--scenario', 'quick-sheet');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const res = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
  assert.deepStrictEqual(res.runs.map((x) => x.id), ['toast', 'quick-sheet']);
  for (const c of res.runs.flatMap((x) => x.captures)) assert.ok(fs.existsSync(path.join(out, c.file)), c.file);
  assert.deepStrictEqual(fs.readdirSync(cwd), [], 'nothing lands in the working directory');
  const rep = go('report', out);
  assert.strictEqual(rep.status, 0, rep.stderr);
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  assert.match(go('run', '--list').stdout, /redirect-all/);
});

test('dry run: a refused write fails its scenario with the exact refusal, and changes nothing', async () => {
  const { r, state, run } = await dryRun({ faults: { writeRefused: true } }, ['write-name', 'write-toggle', 'write-picture-mode', 'write-volume-row']);
  for (const x of r.runs) assert.strictEqual(x.status, 'fail', x.id);
  assert.match(run('write-name').reason, /the TV refused: settings: Network\/deviceName not saved: Permission denied/);
  assert.match(run('write-toggle').reason, /quickStartMode not saved: Permission denied/);
  assert.deepStrictEqual(state.settings, (await imp('fake/tv.mjs')).initialState().settings);
});

test('dry run: coldboot reboots, waits for ssh and the hook, then checks in order, and can run again', () => {
  const cli = path.join(dir, 'tv-suite.mjs'), f = path.join(tmp('boot-state'), 'tv.json');
  const go = (...a) => spawnSync(process.execPath, [cli, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 120000 });
  assert.strictEqual(go('deploy').status, 0);
  for (let i = 1; i <= 2; i++) {
    const out = tmp('boot');
    const r = go('coldboot', out);
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const b = JSON.parse(fs.readFileSync(path.join(out, 'coldboot.json'), 'utf8'));
    for (const k of ['sshUp', 'hookDone', 'layerReady', 'hostReady']) assert.strictEqual(typeof b.timings[k], 'number', k);
    const names = b.checks.map((c) => c.name);
    assert.deepStrictEqual(names.slice(0, 4), ['the hook mounted the stub', "mount lists the bind over LG's Settings", 'no stock Settings is resident after boot', 'redirect, first after the boot']);
    assert.ok(b.checks.every((c) => c.ok), JSON.stringify(b.checks));
    assert.strictEqual(JSON.parse(fs.readFileSync(f, 'utf8')).boots, i);
    if (i === 2) {
      assert.strictEqual(go('run', out, '--scenario', 'redirect').status, 0);
      const pngs = (d) => fs.existsSync(path.join(out, d)) ? fs.readdirSync(path.join(out, d)).filter((x) => x.endsWith('.png')) : [];
      assert.ok(pngs('coldboot/redirect').length > 0 && pngs('redirect').length > 0, 'the boot\'s frames and the run\'s are both kept');
      assert.strictEqual(go('report', out).status, 0);
      assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /coldboot\/redirect\/01-/);
    }
  }
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual(s.unknown, []);
  s.faults = { hookA: true };
  fs.writeFileSync(f, JSON.stringify(s));
  const bad = go('coldboot', tmp('boot'));
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /FAIL the hook mounted the stub: settings left stock \(our Settings host never reported ready\)/);
});

test('dry run: the manual pass prints only the steps that need a person, records verdicts and checks what it saw', () => {
  const cli = path.join(dir, 'tv-suite.mjs'), f = path.join(tmp('man-state'), 'tv.json'), out = tmp('man');
  const go = (input, ...a) => spawnSync(process.execPath, [cli, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 180000, input });
  const list = go('', 'manual', '--print');
  for (const id of ['picture-blink', 'real-callers', 'gear-held', 'pointer', 'screen-off', 'channel-keys', 'back-live', 'back-hdmi']) assert.match(list.stdout, new RegExp('\\[' + id + '\\]'));
  for (const id of ['home-tile', 'exit', 'home', 'hotkeys', 'picker-move', 'leave-for-lg', 'back-refusing-app', 'layer-broken', 'part-removed', 'stub-removed']) assert.doesNotMatch(list.stdout, new RegExp('\\[' + id + '\\]'), id + ' is a scenario now');
  assert.strictEqual(go('', 'deploy').status, 0);
  const r = go('p\np looks fine\nf the picture blinked\n', 'manual', out, '--item', 'gear-held', '--item', 'pointer', '--item', 'picture-blink');
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manual.json'), 'utf8'));
  assert.deepStrictEqual(m.items.map((x) => x.id), ['picture-blink', 'gear-held', 'pointer']);
  const by = (id) => m.items.find((x) => x.id === id);
  assert.strictEqual(by('picture-blink').verdict, 'pass');
  // Nobody held the gear on the fake: the person's pass is not what the suite saw.
  assert.strictEqual(by('gear-held').verdict, 'fail');
  assert.ok(by('gear-held').checks.some((c) => !c.ok && /what the suite saw agrees/.test(c.name)));
  assert.strictEqual(by('gear-held').note, 'looks fine');
  assert.strictEqual(by('pointer').verdict, 'fail');
  assert.strictEqual(by('pointer').note, 'the picture blinked');
  assert.strictEqual(r.status, 1, 'a failed verdict fails the pass');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual(s.unknown, []);
  assert.deepStrictEqual(s.events, []);
  assert.strictEqual(go('', 'report', out).status, 0);
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /Manual pass/);
});

test('dry run: the fallback scenarios run only when named, break the layer or the stub on purpose and put it back', () => {
  const cli = path.join(dir, 'tv-suite.mjs'), f = path.join(tmp('fb-state'), 'tv.json');
  const go = (...a) => spawnSync(process.execPath, [cli, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 300000 });
  assert.match(go('run', '--list').stdout, /fallback-part-removed\s+\(only when named\)/);
  assert.strictEqual(go('deploy').status, 0);
  const out = tmp('fb');
  const r = go('run', out, '--scenario', 'fallback-layer-broken', '--scenario', 'fallback-part-removed', '--scenario', 'fallback-stub-removed');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const res = JSON.parse(fs.readFileSync(path.join(out, 'results.json'), 'utf8'));
  const by = (id) => res.runs.find((x) => x.id === id);
  assert.ok(by('fallback-layer-broken').checks.some((c) => c.ok && /hook leaves LG's Settings/.test(c.name)));
  assert.ok(by('fallback-part-removed').checks.some((c) => c.ok && /the gear opens LG's Quick Settings/.test(c.name)));
  assert.ok(by('fallback-stub-removed').checks.some((c) => c.ok && /install-boot.sh remove unmounts the stub/.test(c.name)));
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(s.mounted && s.settingsHost && s.broken === null && s.stub, 'the good layer and the stub are back');
  assert.deepStrictEqual(s.launched, ['com.palm.app.settings', 'com.palm.app.settings'], "LG's Settings opened on purpose, once per fallback");
  assert.deepStrictEqual(s.events, []);
  assert.deepStrictEqual(s.unknown, []);
  assert.ok(!s.lgQs, "LG's Quick Settings is closed");
});

test('turned off meanwhile (an HDMI device through CEC, or a person): nothing is restored over it and the run stops', async () => {
  const off = await dryRun({ faults: { standbyOnToast: true } }, ['toast', 'hotkeys']);
  assert.ok(off.run('toast').checks.some((c) => !c.ok && /power: was "Active", now "ActiveStandby"/.test(c.detail)));
  assert.strictEqual(off.run('hotkeys'), undefined, 'no scenario starts after it');
  assert.ok(!off.state.inputLaunches, 'the input is not launched over a TV in standby');
  await assert.rejects(dryRun({ power: 'ActiveStandby' }, ['toast']), /the TV is not on \(power state "ActiveStandby"\)/);
});

test("systemUIManager's foregroundAppInfo list is read as the TV answers it, and anything else is unknown", async () => {
  const { systemUiFront } = await imp('lib/run.mjs');
  const tv = (answer) => ({ luna: async () => { if (answer instanceof Error) throw answer; return answer; } });
  assert.strictEqual(await systemUiFront(tv({ foregroundAppInfo: [], returnValue: true })), '');
  assert.strictEqual(await systemUiFront(tv({ foregroundAppInfo: [{ appId: 'com.webos.app.quicksettings' }], returnValue: true })), 'com.webos.app.quicksettings');
  assert.strictEqual(await systemUiFront(tv({ foregroundAppInfo: [{ appId: 'com.webos.app.quickinputpicker' }] })), 'com.webos.app.quickinputpicker');
  assert.strictEqual(await systemUiFront(tv({ foregroundAppInfo: [{ appId: 'com.webos.app.someoverlay' }] })), 'unknown', 'any other LG overlay is unknown');
  assert.strictEqual(await systemUiFront(tv({ appId: 'com.webos.app.quicksettings', returnValue: true })), 'unknown');
  assert.strictEqual(await systemUiFront(tv({ foregroundAppInfo: [{}] })), 'unknown');
  assert.strictEqual(await systemUiFront(tv(new Error('no answer'))), 'unknown');
});

test('dry run: the key socket is asked for before the first key, and a missing one stops the run clearly', async () => {
  const ok = await dryRun({}, ['quick-sheet']);
  assert.strictEqual(ok.run('quick-sheet').status, 'pass');
  assert.ok(ok.state.netinput, 'getPointerInputSocket was called');
  await assert.rejects(dryRun({ faults: { noKeySocket: true } }, ['quick-sheet']), /key socket \/tmp\/netinput\.pointer\.sock is missing after getPointerInputSocket/);
  const odd = await dryRun({ faults: { oddSystemUi: true } }, ['quick-sheet', 'input-picker']);
  assert.strictEqual(odd.run('quick-sheet').status, 'fail', 'no key is pressed while LG\'s UI state is unknown');
  assert.strictEqual(odd.run('input-picker').status, 'skip');
  assert.deepStrictEqual(odd.state.events, []);
});

test('dry run: the Look app opens the Look page, and a bus refusal in the log fails it', async () => {
  const ok = await dryRun({}, ['look-app']);
  assert.strictEqual(ok.run('look-app').status, 'pass', ok.run('look-app').reason);
  const bad = await dryRun({ faults: { lookAppDenied: true } }, ['look-app']);
  assert.ok(bad.run('look-app').checks.some((c) => !c.ok && /no permission error/.test(c.name) && /Permission denied/.test(c.detail)));
});

// The safety verifier's blockers, reproduced and shown fixed.
const CLI = path.join(dir, 'tv-suite.mjs');
function fakeFile(over) {
  const f = path.join(tmp('blk'), 'tv.json');
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 180000 });
  assert.strictEqual(run('deploy', tmp('dep')).status, 0);
  if (over) { const s = JSON.parse(fs.readFileSync(f, 'utf8')); fs.writeFileSync(f, JSON.stringify(Object.assign(s, typeof over === 'function' ? over(s) : over))); }
  return { f, run, state: () => JSON.parse(fs.readFileSync(f, 'utf8')) };
}
const readFake = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// Starts a dry-run command, waits until `when(state)` holds in the fake TV, then sends `signal`.
function interrupted(f, args, when, signal) {
  const { spawn } = require('node:child_process');
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CLI, ...args, '--dry-run', '--fake-state', f], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', sent = false;
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const t = setInterval(() => { const s = readFake(f); if (!sent && s && when(s)) { sent = true; p.kill(signal); } }, 5);
    p.on('close', (code, sig) => { clearInterval(t); resolve({ code, sig, out, sent }); });
  });
}

test('blocker: SIGINT in the middle of a write restores the TV from the journal and closes it', async () => {
  const { f, state } = fakeFile({ faults: { slow: 15 } });
  const r = await interrupted(f, ['run', tmp('int'), '--scenario', 'write-name'], (s) => s.settings.deviceName === 'Living roomx', 'SIGINT');
  assert.ok(r.sent, 'the write happened');
  assert.strictEqual(r.code, 130, r.out);
  assert.match(r.out, /SIGINT: stopping, and restoring the TV from the journal/);
  assert.strictEqual(state().settings.deviceName, 'Living room', 'the name is back');
  assert.match(r.out, /back to the baseline, read back; journal closed/);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)).filter((x) => x.endsWith('.json') && x !== 'tv.json'), [], 'no journal pointer left');
});

test('blocker: a killed command leaves its journal; the next command restores from it before taking a baseline', async () => {
  const { f, run, state } = fakeFile({ faults: { slow: 15 } });
  const r = await interrupted(f, ['run', tmp('kill'), '--scenario', 'write-name'], (s) => s.settings.deviceName === 'Living roomx', 'SIGKILL');
  assert.ok(r.sent);
  assert.strictEqual(state().settings.deviceName, 'Living roomx', 'killed: nothing could restore');
  const s = state(); s.faults = {}; fs.writeFileSync(f, JSON.stringify(s));
  const next = run('run', tmp('next'), '--scenario', 'toast');
  assert.match(next.stdout, /restoring from the journal/);
  assert.strictEqual(state().settings.deviceName, 'Living room', 'restored before the new baseline');
  assert.strictEqual(next.status, 0, next.stdout + next.stderr);
  const res = JSON.parse(fs.readFileSync(path.join(next.stdout.match(/results: (\S+)/)[1]), 'utf8'));
  assert.strictEqual(res.notes.start.deviceName, 'Living room', 'the new baseline is the restored TV, not the half-written one');
});

test('blocker: a journal that cannot be restored stops the next command', async () => {
  const { f, run, state } = fakeFile({ faults: { slow: 15 } });
  await interrupted(f, ['run', tmp('kill2'), '--scenario', 'write-name'], (s) => s.settings.deviceName === 'Living roomx', 'SIGKILL');
  const s = state(); s.faults = {}; s.btDevices = []; fs.writeFileSync(f, JSON.stringify(s));
  const next = run('run', tmp('next2'), '--scenario', 'toast');
  assert.notStrictEqual(next.status, 0);
  assert.match(next.stdout + next.stderr, /not back to the journal's baseline: bluetooth: was/);
  assert.ok(!/== toast/.test(next.stdout), 'nothing new started');
});

test('blocker: SIGINT in a fallback scenario puts the good layer back', async () => {
  const { f, state } = fakeFile({ faults: { slow: 5 } });
  const r = await interrupted(f, ['run', tmp('mint'), '--scenario', 'fallback-layer-broken'], (s) => s.broken === 'layer' && /left stock/.test(s.themepackLog), 'SIGINT');
  assert.ok(r.sent);
  assert.strictEqual(r.code, 130, r.out);
  const s = state();
  assert.ok(s.broken === null && s.mounted && s.settingsHost, 'good layer, stub mounted: ' + JSON.stringify({ broken: s.broken, mounted: s.mounted, host: s.settingsHost }));
  assert.match(r.out, /the good layer is back: host ready, the stub mounted, our probe up/);
});

test('blocker: a stale probe presses nothing, closeAll included', async () => {
  const fake = await imp('fake/tv.mjs');
  // A run does not even start on a stale probe.
  await assert.rejects(dryRun({ faults: { staleProbe: true } }, ['quick-sheet']), /our Settings' probe is 60 s old: the layer is not refreshing it/);
  // Our menu open, then the layer dies (its probe goes stale): closeAll's BACK is refused too.
  const { makeTv } = await imp('lib/tv.mjs');
  const { makeCtx, closeAll } = await imp('lib/run.mjs');
  const st = fake.deployedState({ netinput: true });
  st.quick.open = true; st.quick.stack = [{ id: 'quick' }];
  st.faults.staleProbe = true;
  st.probingUntil = Date.now() + 600000;
  const ctx = makeCtx({ tv: makeTv({ host: 'tv.invalid', exec: fake.inProcess(st) }), out: tmp('stale'), say: () => {}, poll: 5, sleep: (ms) => new Promise((x) => setTimeout(x, Math.min(ms, 10))) });
  assert.match(await closeAll(ctx), /could not be closed: stale state/);
  assert.deepStrictEqual(st.keys, []);
});

test('blocker: no PIN-derived value is written anywhere', () => {
  const { f, run } = fakeFile((s) => ({ settings: Object.assign(s.settings, { systemPin: '4826' }) }));
  const out = tmp('pin');
  const r = run('run', out, '--scenario', 'pin', '--scenario', 'write-toggle');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const files = [];
  (function walk(d) { for (const x of fs.readdirSync(d)) { const p = path.join(d, x); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } })(out);
  for (const p of files.filter((x) => !x.endsWith('.png'))) {
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(!text.includes('4826'), p + ' holds the PIN');
    assert.doesNotMatch(text, /"pin"\s*:/, p + ' holds a pin field');
  }
  assert.ok(!(r.stdout + r.stderr).includes('4826'), 'nor the output');
});

test('blocker: an unreadable value is never a baseline, and nothing starts without one', async () => {
  await assert.rejects(dryRun({ faults: { unreadable: ['soundMode'] } }, ['toast']), /no baseline: soundMode is unreadable/);
});

test('blocker: deploy backs up the old setup once, and rollback puts exactly it back', () => {
  const f = path.join(tmp('rb'), 'tv.json');
  const fake = require('node:path');
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 180000 });
  const old = { faults: {}, oldHook: true, rootSettings: true, mounted: 'patched' };
  // The TV as found: the old boot hook, its patched Settings mounted, no Look package.
  fs.writeFileSync(f, JSON.stringify(Object.assign(JSON.parse(spawnSync(process.execPath, ['-e', 'import(process.argv[1]).then(m=>console.log(JSON.stringify(m.initialState())))', path.join(dir, 'fake/tv.mjs')], { encoding: 'utf8' }).stdout), old)));
  const d = run('deploy', tmp('d'));
  assert.strictEqual(d.status, 0, d.stdout + d.stderr);
  assert.match(d.stdout, /backup made/);
  let s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(s.hook && !s.oldHook && !s.rootSettings, 'deploy replaced the old hook and removed the old Settings');
  assert.match(run('deploy', tmp('d2')).stdout, /backup kept from before/, 'a second deploy keeps the first backup');
  const rb = run('rollback', tmp('r'));
  assert.strictEqual(rb.status, 0, rb.stdout + rb.stderr);
  s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(s.oldHook && !s.hook && s.rootSettings && s.mounted === 'patched' && !s.installed, JSON.stringify({ oldHook: s.oldHook, hook: s.hook, rootSettings: s.rootSettings, mounted: s.mounted, installed: s.installed }));
  const pr = spawnSync(process.execPath, [CLI, 'rollback', '--print'], { encoding: 'utf8', env: Object.assign({}, process.env, { TV_HOST: '' }) });
  assert.strictEqual(pr.status, 0, pr.stderr);
  assert.match(pr.stdout, /appInstallService\/dev\/remove/);
  void fake;
});

test('without --live every command is a dry run, whatever TV_HOST says', () => {
  const r = spawnSync(process.execPath, [CLI, 'run', tmp('nolive'), '--scenario', 'toast'], { encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, { TV_HOST: 'tv.example' }) });
  assert.match(r.stdout, /no --live: a dry run against the fake TV, not tv\.example/);
});

test('closeAll closes LG\'s Quick Settings with closeByAppId, and coldboot puts the input back', async () => {
  const r = await dryRun({ lgQs: true }, ['toast']);
  assert.strictEqual(r.state.lgQs, false);
  const { f, run, state } = fakeFile();
  const c = run('coldboot', tmp('cb'));
  assert.strictEqual(c.status, 0, c.stdout);
  assert.match(c.stdout, /ok {3}the input is back on com\.webos\.app\.hdmi2: the boot came up on com\.webos\.app\.livetv; restored by launching com\.webos\.app\.hdmi2/);
  assert.match(c.stdout, /ok {3}the TV is back to the baseline from before the reboot, read back/);
  assert.strictEqual(state().fg, 'com.webos.app.hdmi2');
  void f;
});

test('baseline is a read-only preflight that names every unreadable value and never shows the PIN', () => {
  const { f, run, state } = fakeFile((s) => ({ settings: Object.assign(s.settings, { systemPin: '4826' }), faults: { unreadable: ['quickStartMode'] } }));
  const before = JSON.stringify(state().settings);
  const r = run('baseline');
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /UNREADABLE quickStartMode/);
  assert.match(r.stdout, /ok {9}PIN \(lock\.systemPin; its value is never shown\)/);
  assert.ok(!r.stdout.includes('4826'));
  assert.strictEqual(JSON.stringify(state().settings), before);
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f)).filter((x) => x !== 'tv.json'), [], 'no journal');
});

test('an interrupt during the cold boot\'s wait restores the input from the pre-reboot journal', async () => {
  const { f, state } = fakeFile({ faults: { slow: 10, slowBoot: true } });
  const r = await interrupted(f, ['coldboot', tmp('cbi')], (s) => s.boots === 1 && s.down > 0, 'SIGINT');
  assert.ok(r.sent);
  assert.strictEqual(r.code, 130, r.out);
  assert.strictEqual(state().fg, 'com.webos.app.hdmi2', r.out);
});

test('probing: a run refuses to start while it has not come up, and the guard presses nothing while it is off', async () => {
  await assert.rejects(dryRun({ faults: { probingStuckOff: true } }, ['quick-sheet']), /probing did not come up on the TV: nothing can be seen, so nothing is pressed/);
  const fake = await imp('fake/tv.mjs');
  const { makeTv } = await imp('lib/tv.mjs');
  const { makeCtx } = await imp('lib/run.mjs');
  const st = fake.deployedState({ netinput: true });
  st.quick.open = true; st.quick.stack = [{ id: 'quick' }];
  const ctx = makeCtx({ tv: makeTv({ host: 'tv.invalid', exec: fake.inProcess(st) }), out: tmp('poff'), say: () => {}, poll: 5, sleep: (ms) => new Promise((x) => setTimeout(x, Math.min(ms, 10))) });
  await assert.rejects(ctx.key('BACK'), /probing is off on the TV/);
  assert.deepStrictEqual(st.keys, []);
});

test('probing: each command turns it on first and off at the end, also when interrupted', async () => {
  const { f, run, state } = fakeFile({ probingCalls: [] });
  const r = run('run', tmp('pon'), '--scenario', 'toast');
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  let s = state();
  assert.strictEqual(s.probingCalls[0], true);
  assert.strictEqual(s.probingCalls[s.probingCalls.length - 1], false, 'off at the end');
  assert.strictEqual(s.probingUntil, 0);
  s.faults = { slow: 15 }; s.probingCalls = []; fs.writeFileSync(f, JSON.stringify(s));
  const i = await interrupted(f, ['run', tmp('poi'), '--scenario', 'write-name'], (x) => x.settings.deviceName === 'Living roomx', 'SIGINT');
  assert.strictEqual(i.code, 130, i.out);
  s = state();
  assert.strictEqual(s.probingCalls[s.probingCalls.length - 1], false, 'off after the signal restore too');
  assert.strictEqual(s.probingUntil, 0);
});

test('settings keep their type: compared normalised, written back as read, and a type change is caught', async () => {
  const { same, sameType, norm } = await imp('lib/run.mjs');
  assert.ok(same('85', 85) && same({ a: '1' }, { a: 1 }) && !same('85', '86') && !same({ unreadable: 'x' }, { unreadable: 'x' }));
  assert.ok(!sameType('85', 85) && sameType('85', '86'));
  assert.deepStrictEqual(norm(['1', 'on', true]), [1, 'on', true]);
  const ok = await dryRun({}, ['write-contrast']);
  assert.strictEqual(ok.run('write-contrast').status, 'pass', ok.run('write-contrast').reason);
  assert.ok(ok.run('write-contrast').checks.some((c) => c.ok && /Contrast keeps the TV's type \(string\)/.test(c.name) && /"85" -> "86"/.test(c.detail)));
  assert.strictEqual(ok.state.settings.contrast, '85');
  // A store that writes a number where the TV keeps a string: the scenario fails on the type, and the restore puts the
  // string back (written as it was read).
  const bug = await dryRun({ faults: { typeBug: true } }, ['write-contrast']);
  assert.strictEqual(bug.run('write-contrast').status, 'fail');
  assert.ok(bug.run('write-contrast').checks.some((c) => !c.ok && /Contrast keeps the TV's type \(string\)/.test(c.name) && /"85" -> 86/.test(c.detail)));
  assert.strictEqual(bug.state.settings.contrast, '85', 'restored as the string it was');
});

test('deploy over a layer already in place (deployed by hand): backs up first, says the backup is that setup, and is idempotent', () => {
  const { f, run, state } = fakeFile();
  const s = state(); s.backup = null; fs.writeFileSync(f, JSON.stringify(s));
  const d = run('deploy', tmp('again'));
  assert.strictEqual(d.status, 0, d.stdout + d.stderr);
  assert.match(d.stdout, /backup made/);
  assert.match(d.stdout, /the TV already runs our boot hook and stub, so this backup holds that setup; the TV's setup from before our layer is not in it/);
  const after = state();
  assert.ok(after.installed && after.layer && after.mounted && after.settingsHost);
  assert.strictEqual(run('deploy', tmp('again2')).status, 0);
  assert.deepStrictEqual(state().unknown, []);
});

test('re-verify 1: deploy keeps the owner\'s look, skips a package that matches the build, and rollback restores the service data', () => {
  const { f, run, state } = fakeFile();
  assert.strictEqual(state().installs, 1);
  let s = state(); s.look = { style: 'bubble', themes: ['winter'] }; s.faults = { installResetsLook: true }; s.backup = null; fs.writeFileSync(f, JSON.stringify(s));
  const same = run('deploy', tmp('same'));
  assert.strictEqual(same.status, 0, same.stdout + same.stderr);
  assert.match(same.stdout, /the installed Look package matches this build \([0-9a-f]{32}\): not reinstalled/);
  assert.match(same.stdout, /the backup on the TV was made \d{4}-\d\d-\d\dT/);
  assert.strictEqual(state().installs, 1, 'no reinstall');
  // A package that differs (an older build on the TV): reinstalled, and the look the reinstall lost is set back.
  s = state(); s.packageHash = 'an-older-build'; fs.writeFileSync(f, JSON.stringify(s));
  const re = run('deploy', tmp('re'));
  assert.strictEqual(re.status, 0, re.stdout + re.stderr);
  assert.match(re.stdout, /the look before installing: \{"style":"bubble","themes":\["winter"\]\}/);
  assert.match(re.stdout, /the reinstall changed the look .*: setting it back/);
  assert.match(re.stdout, /the look is back, read back: \{"style":"bubble","themes":\["winter"\]\}/);
  assert.strictEqual(state().installs, 2);
  assert.deepStrictEqual(state().look, { style: 'bubble', themes: ['winter'] });
  // Rollback puts the backed-up service data (the look) back, and says when the backup was made.
  s = state(); s.look = { style: 'smoke', themes: [] }; s.faults = {}; fs.writeFileSync(f, JSON.stringify(s));
  const rb = run('rollback', tmp('rb2'));
  assert.strictEqual(rb.status, 0, rb.stdout + rb.stderr);
  assert.match(rb.stdout, /the backup was made \d{4}-\d\d-\d\dT/);
  assert.match(rb.stdout, /PASS put back the Look service's data/);
  assert.deepStrictEqual(state().look, { style: 'bubble', themes: ['winter'] });
});

test('re-verify 1: the package hash is the same from the .ipk as from its files', async () => {
  const { digest } = await imp('lib/package.mjs');
  assert.strictEqual(digest([{ path: 'b', md5: '2' }, { path: 'a', md5: '1' }]), require('node:crypto').createHash('md5').update('1  a\n2  b\n').digest('hex'));
});

test('re-verify 2: volume and mute are refused while the state is stale, probing is off, or an LG overlay is up', async () => {
  const { guard } = await imp('lib/keys.mjs');
  const base = { settings: { quick: { open: false }, menu: { open: false } }, systemUi: '' };
  assert.strictEqual(guard('VOLUMEUP', base, { volume: true }), null);
  for (const k of ['VOLUMEUP', 'VOLUMEDOWN', 'MUTE']) {
    assert.match(guard(k, Object.assign({}, base, { fresh: false, stale: 'probing is off on the TV' }), { volume: true }), /stale state/, k);
    assert.match(guard(k, Object.assign({}, base, { systemUi: 'unknown' }), { volume: true }), /LG overlay we do not know/, k);
    assert.match(guard(k, Object.assign({}, base, { systemUi: 'com.webos.app.quicksettings' }), { volume: true }), /LG's Quick Settings is open/, k);
    assert.match(guard(k, Object.assign({}, base, { picker: { shown: true } }), { volume: true }), /input picker is open/, k);
  }
});

test('re-verify 3: an unreadable PIN stops every command that presses keys, and fails the preflight', async () => {
  await assert.rejects(dryRun({ faults: { unreadable: ['systemPin'] } }, ['toast']), /the PIN \(lock\.systemPin\) is unreadable/);
  const { run } = fakeFile({ faults: { unreadable: ['systemPin'] } });
  const b = run('baseline');
  assert.strictEqual(b.status, 1);
  assert.match(b.stdout, /UNREADABLE PIN/);
});

test('re-verify 4: probes from a restarted layer instance are taken only after it sends again', async () => {
  const fake = await imp('fake/tv.mjs');
  const { makeTv } = await imp('lib/tv.mjs');
  const { makeCtx } = await imp('lib/run.mjs');
  const { guard } = await imp('lib/keys.mjs');
  const st = fake.deployedState({ netinput: true, probingUntil: Date.now() + 600000 });
  st.quick.open = true; st.quick.stack = [{ id: 'quick' }]; st.quick.index = 0;
  const ctx = makeCtx({ tv: makeTv({ host: 'tv.invalid', exec: fake.inProcess(st) }), out: tmp('inst'), say: () => {}, poll: 5, sleep: (ms) => new Promise((x) => setTimeout(x, Math.min(ms, 10))) });
  assert.ok((await ctx.state()).fresh, 'the first instance is taken');
  st.layerInstance = (st.layerInstance || 1) + 1;
  const after = await ctx.state();
  assert.strictEqual(after.fresh, false);
  assert.match(after.stale, /the layer restarted \(instance \d+ -> \d+\): waiting for its next probe/);
  assert.match(guard('BACK', after), /stale state/);
  assert.ok((await ctx.state()).fresh, 'its next probe confirms it');
});

test('bluetooth2: the baseline holds the paired devices and their connected profiles; a change is caught', async () => {
  const fake = await imp('fake/tv.mjs');
  const { makeTv } = await imp('lib/tv.mjs');
  const { makeCtx, snapshot } = await imp('lib/run.mjs');
  const st = fake.deployedState({ netinput: true });
  const ctx = makeCtx({ tv: makeTv({ host: 'tv.invalid', exec: fake.inProcess(st) }), out: tmp('bt'), say: () => {} });
  assert.deepStrictEqual((await snapshot(ctx)).values.bluetooth, { paired: ['00:00:00:00:00:01 a2dp', '00:00:00:00:00:02 hid'] });
  const r = await dryRun({ btDevices: [{ name: 'Speaker', address: '00:00:00:00:00:01', paired: true, connectedProfiles: [] }] }, ['toast']);
  assert.strictEqual(r.run('toast').status, 'pass', 'a baseline taken as found');
  assert.ok(r.run('reads') === undefined);
  const reads = await dryRun({}, ['reads']);
  assert.ok(reads.run('reads').checks.some((c) => c.ok && /bluetooth2 device\/getStatus gives devices/.test(c.name)));
});

test('an older Look service on the TV (setProbing unknown): baseline and run say to deploy first', async () => {
  await assert.rejects(dryRun({ faults: { oldService: true } }, ['toast']), /predates probing \(setProbing is unknown there\): run deploy first/);
  const { run } = fakeFile({ faults: { oldService: true } });
  const b = run('baseline');
  assert.strictEqual(b.status, 4, b.stdout + b.stderr);
  assert.match(b.stdout, /DEPLOY {5}the Look service on the TV predates probing \(setProbing is unknown there\): run deploy first/);
  assert.match(b.stdout, /ok {9}bluetooth: \{"paired":/);
});

test('luna answers are parsed whole: one line or pretty-printed over several, as the TV sends them', async () => {
  const { parseAnswer, makeTv } = await imp('lib/tv.mjs');
  const { systemUiFront } = await imp('lib/run.mjs');
  // systemUIManager's answer exactly as the live TV printed it over ssh -tt (CRLF line ends).
  const live = '{\r\n    "foregroundAppInfo": [\r\n    ],\r\n    "returnValue": true\r\n}\r\n';
  assert.deepStrictEqual(parseAnswer('luna://x', live), { foregroundAppInfo: [], returnValue: true });
  assert.deepStrictEqual(parseAnswer('luna://x', '{"returnValue":true,"appId":"com.webos.app.hdmi1"}\r\n'), { returnValue: true, appId: 'com.webos.app.hdmi1' });
  assert.deepStrictEqual(parseAnswer('luna://x', '{\n  "returnValue": true,\n  "apps": [\n    { "id": "a", "processid": "1" }\n  ]\n}\n'), { returnValue: true, apps: [{ id: 'a', processid: '1' }] });
  assert.throws(() => parseAnswer('luna://x', '', 'Connection refused'), /luna:\/\/x: no answer \(Connection refused\)/);
  assert.throws(() => parseAnswer('luna://x', '{\n  "returnValue": tru\n}'), /luna:\/\/x: unreadable answer \(.*\): \{ "returnValue": tru \}/);
  // Through the transport: the pretty-printed empty list reads as nothing in front, not unknown.
  const exec = async () => ({ status: 0, stdout: live, stderr: '' });
  const tv = makeTv({ host: 'tv.invalid', exec });
  assert.deepStrictEqual(await tv.luna('luna://com.webos.service.systemUIManager/getForegroundAppInfo', {}), { foregroundAppInfo: [], returnValue: true });
  assert.strictEqual(await systemUiFront(tv), '');
  const qs = '{\r\n    "foregroundAppInfo": [\r\n        {\r\n            "appId": "com.webos.app.quicksettings"\r\n        }\r\n    ],\r\n    "returnValue": true\r\n}\r\n';
  assert.strictEqual(await systemUiFront(makeTv({ host: 'tv.invalid', exec: async () => ({ status: 0, stdout: qs, stderr: '' }) })), 'com.webos.app.quicksettings');
});
