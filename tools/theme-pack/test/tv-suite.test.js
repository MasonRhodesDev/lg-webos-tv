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
  const lines = [];
  const tv = makeTv({ host: 'tv.invalid', exec: fake.inProcess(state) });
  const ctx = makeCtx({ tv, out, say: (l) => lines.push(l), poll: 10, sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 30))) });
  const r = await runScenarios(ctx, ids ? SCENARIOS.filter((s) => ids.includes(s.id)) : SCENARIOS);
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
  for (const k of ['UP', 'DOWN', 'ENTER', 'LEFT', 'BACK']) assert.match(guard(k, none), /app underneath/, k);
  assert.strictEqual(guard('QMENU', none), null);
  assert.match(guard('ENTER', Object.assign({}, none, { systemUi: 'com.webos.app.quickinputpicker' })), /select an input/);
  assert.strictEqual(guard('RIGHT', Object.assign({}, none, { picker: { shown: true } })), null);
  assert.match(guard('LEFT', Object.assign({}, none, { systemUi: 'com.webos.app.quicksettings' })), /set a mode/, "never Left/Right on LG's Quick Settings");
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
  assert.ok(Object.keys(KEYS).every((k) => ['proven', 'table', 'unverified'].includes(KEYS[k].from)));
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
  assert.match(broken.out, /FAIL layer: the layer did not load: layer root never reported; back to stock/);
  const refused = deploy(Object.assign({}, fresh, { faults: { installFails: true } }));
  assert.match(refused.out, /FAIL look: the TV refused the package/);
  const noLayer = deploy(Object.assign({}, base, { layerFiles: false, layer: false, mounted: false }), '--only', 'boot');
  assert.match(noLayer.out, /FAIL boot: the boot hook: settings left stock \(the stub needs our layer and the Look service\)/);
});

test('dry run: every scenario passes against the fake TV and leaves it as it was', async () => {
  const { r, state, out, lines, run } = await dryRun();
  for (const x of r.runs) assert.strictEqual(x.status, 'pass', x.id + ': ' + x.reason + '\n' + lines.join('\n'));
  for (const c of r.end) assert.ok(c.ok, c.name + ': ' + c.detail);
  assert.deepStrictEqual(state.events, [], 'nothing changed, switched, joined, paired or reached the app underneath');
  assert.deepStrictEqual(state.writes.slice().sort(), ['Network/deviceName', 'Network/deviceName', 'pictureMode', 'pictureMode', 'quickStartMode', 'quickStartMode', 'volume', 'volume'],
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
  assert.ok(pick.run('picture-mode').checks.some((c) => !c.ok && c.name === 'the TV is as it was' && /pictureMode/.test(c.detail)));
  assert.strictEqual(pick.state.settings.pictureMode, 'expert1', 'and the suite put it back');

  const unmounted = await dryRun({ mounted: false }, ['redirect']);
  assert.strictEqual(unmounted.run('redirect').status, 'skip');
  assert.deepStrictEqual(unmounted.state.events, [], "LG's Settings is never launched without the stub");

  await assert.rejects(dryRun({ faults: { noProbe: true } }, ['toast']), /publishes no probe.*deploy this branch first/);

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
  }
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepStrictEqual(s.unknown, []);
  s.faults = { hookA: true };
  fs.writeFileSync(f, JSON.stringify(s));
  const bad = go('coldboot', tmp('boot'));
  assert.strictEqual(bad.status, 1);
  assert.match(bad.stdout, /FAIL the hook mounted the stub: settings left stock \(our Settings host never reported ready\)/);
});

test('dry run: the manual pass prints its checklist, breaks the layer on purpose, records verdicts and puts the layer back', () => {
  const cli = path.join(dir, 'tv-suite.mjs'), f = path.join(tmp('man-state'), 'tv.json'), out = tmp('man');
  const go = (input, ...a) => spawnSync(process.execPath, [cli, ...a, '--dry-run', '--fake-state', f], { encoding: 'utf8', timeout: 180000, input });
  const list = go('', 'manual', '--print');
  for (const id of ['home-tile', 'pointer', 'exit', 'home', 'gear-held', 'picture-blink', 'back-refusing-app', 'layer-broken', 'part-removed']) assert.match(list.stdout, new RegExp('\\[' + id + '\\]'));
  assert.strictEqual(go('', 'deploy').status, 0);
  const r = go('p\np\np looks fine\nf the tile opened nothing\n', 'manual', out, '--item', 'layer-broken', '--item', 'part-removed', '--item', 'stub-removed', '--item', 'exit');
  const m = JSON.parse(fs.readFileSync(path.join(out, 'manual.json'), 'utf8'));
  assert.deepStrictEqual(m.items.map((x) => x.id), ['exit', 'layer-broken', 'part-removed', 'stub-removed']);
  const by = (id) => m.items.find((x) => x.id === id);
  assert.strictEqual(by('layer-broken').verdict, 'pass', JSON.stringify(by('layer-broken')));
  assert.ok(by('layer-broken').checks.some((c) => c.ok && /hook leaves LG's Settings/.test(c.name)));
  assert.ok(by('part-removed').checks.some((c) => c.ok && /opens LG's Quick Settings/.test(c.name)));
  assert.strictEqual(by('part-removed').note, 'looks fine');
  assert.strictEqual(by('stub-removed').verdict, 'fail');
  assert.strictEqual(by('stub-removed').note, 'the tile opened nothing');
  assert.strictEqual(r.status, 1, 'a failed verdict fails the pass');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.ok(s.mounted && s.settingsHost && s.broken === null, 'the good layer and the stub are back');
  assert.deepStrictEqual(s.unknown, []);
  assert.deepStrictEqual(s.events, []);
  assert.strictEqual(go('', 'report', out).status, 0);
  assert.match(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), /Manual pass/);
});
