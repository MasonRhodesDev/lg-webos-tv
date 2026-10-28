const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const dir = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'settings', 'catalog.json'), 'utf8'));

function build() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-stub-'));
  execFileSync('node', [path.join(dir, 'webos', 'settings-stub.mjs'), out]);
  return out;
}
const built = build();

// Loads the built stub's scripts as its page would, in a window with a fake bus, clock and WAM. Returns what it did.
function launch(launchParams, opts) {
  opts = opts || {};
  const calls = [], timers = [], listeners = {};
  const did = { calls, closed: 0, relaunch: null, timers, answer: null };
  function PalmServiceBridge() { calls.push(this); }
  PalmServiceBridge.prototype.call = function (uri, params) {
    this.uri = uri;
    this.params = JSON.parse(params);
  };
  const win = {
    PalmServiceBridge,
    PalmSystem: { launchParams },
    close: () => { did.closed++; },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    document: { addEventListener: (name, fn) => { listeners[name] = fn; } }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const f of ['targets.js', 'stub.js']) vm.runInContext(fs.readFileSync(path.join(opts.dir || built, f), 'utf8'), ctx, { filename: f });
  did.relaunch = (detail) => listeners.webOSRelaunch({ detail });
  did.answer = (i) => calls[i].onservicecallback('{"returnValue":true}');
  did.run = (ms) => timers.filter((t) => t.ms === ms).forEach((t) => t.fn());
  return did;
}

const URI = 'luna://dev.themepack.look.service/openSettings';

test('the page loads only its own scripts and draws nothing', () => {
  const html = fs.readFileSync(path.join(built, 'index.html'), 'utf8');
  assert.deepStrictEqual([...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1]), ['targets.js', 'stub.js']);
  assert.match(html, /<body style="background:transparent;margin:0"><\/body>/);
  const info = JSON.parse(fs.readFileSync(path.join(built, 'appinfo.json'), 'utf8'));
  assert.strictEqual(info.id, 'com.palm.app.settings');
  assert.strictEqual(info.main, 'index.html');
  assert.strictEqual(info.transparent, true);
  assert.strictEqual(info.noSplashOnLaunch, true);
  assert.strictEqual(info.visible, false);
  assert.ok(!info.usePrerendering && !info.v8SnapshotFile, 'no prerendering: it would run the stub with no launch');
  assert.ok(fs.existsSync(path.join(built, info.icon)));
});

test('the stub is ES5, for the TV\'s Chromium 53', () => {
  const lint = require('./lib/qml-compat.js');
  const f = path.join(built, 'stub.js');
  assert.deepStrictEqual(lint.checkSource(fs.readFileSync(f, 'utf8'), f, () => false), []);
});

test('every LG deep-link target opens its catalog page', () => {
  for (const [name, where] of Object.entries(catalog.lgTargets.map)) {
    const page = Array.isArray(where) ? where[where.length - 1] : where;
    const did = launch(JSON.stringify({ target: name }));
    assert.strictEqual(did.calls.length, 1, name);
    assert.strictEqual(did.calls[0].uri, URI);
    assert.deepStrictEqual(did.calls[0].params, { target: page }, name);
  }
});

test('no target, an unknown target, or unreadable params open the top of our Settings', () => {
  for (const params of [undefined, '', '{}', '{"item":"pictureMode"}', '{"target":"NoSuchPage"}', '{"target":7}', 'not json']) {
    const did = launch(params);
    assert.deepStrictEqual(did.calls[0].params, {}, String(params));
  }
});

test('params given as an object work too, and other LG params are not forwarded', () => {
  const did = launch({ target: 'network', item: 'wifi', webOSRelaunch: true });
  assert.deepStrictEqual(did.calls[0].params, { target: 'Network' });
});

test('it closes as soon as the service answers', () => {
  const did = launch('{"target":"Bluetooth"}');
  assert.strictEqual(did.closed, 0);
  did.answer(0);
  assert.strictEqual(did.closed, 1);
  did.run(1000);
  did.run(3000);
  assert.strictEqual(did.calls.length, 1, 'no retry after an answer');
  assert.strictEqual(did.closed, 1, 'closes once');
});

test('an unanswered call is sent once more, and the stub closes after 3 s regardless', () => {
  const did = launch('{"target":"SoundOut"}');
  did.run(1000);
  assert.strictEqual(did.calls.length, 2);
  assert.deepStrictEqual(did.calls[1].params, { target: 'SoundOut' });
  assert.strictEqual(did.closed, 0);
  did.run(3000);
  assert.strictEqual(did.closed, 1);
});

test('a relaunch while the stub runs forwards the new target', () => {
  const did = launch('{}');
  did.relaunch({ target: 'Language' });
  assert.deepStrictEqual(did.calls[1].params, { target: 'Language' });
});

// The package tv/build-ipk.sh writes, unpacked: its ar members, then data.tar.gz.
function buildPackage() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'look-ipk-'));
  const ipk = execFileSync('sh', [path.join(dir, 'tv', 'build-ipk.sh'), out], { encoding: 'utf8' }).trim().split('\n').pop();
  const b = fs.readFileSync(ipk), members = {};
  assert.strictEqual(b.toString('latin1', 0, 8), '!<arch>\n');
  for (let at = 8; at < b.length;) {
    const name = b.toString('latin1', at, at + 16).trim(), size = Number(b.toString('latin1', at + 48, at + 58).trim());
    members[name] = b.subarray(at + 60, at + 60 + size);
    at += 60 + size + (size % 2);
  }
  fs.writeFileSync(path.join(out, 'data.tar.gz'), members['data.tar.gz']);
  const root = path.join(out, 'data');
  fs.mkdirSync(root);
  execFileSync('tar', ['-xzf', path.join(out, 'data.tar.gz'), '-C', root]);
  return { members: Object.keys(members), root };
}
const pkg = buildPackage();
const lookApp = path.join(pkg.root, 'usr/palm/applications/dev.themepack.look');

test('the package carries the Look service with its packs, assets and fonts, and the Look app', () => {
  assert.deepStrictEqual(pkg.members, ['debian-binary', 'control.tar.gz', 'data.tar.gz']);
  const svc = path.join(pkg.root, 'usr/palm/services/dev.themepack.look.service');
  for (const f of ['service.js', 'services.json', 'package.json', 'permissions.sh', 'packs/styles/smoke.json', 'packs/themes/winter.json',
    'packs/assets/winter/snow.png', 'packs/fonts/Lexend/OFL.txt']) assert.ok(fs.existsSync(path.join(svc, f)), 'service ' + f);
  assert.ok(fs.existsSync(path.join(pkg.root, 'usr/palm/packages/dev.themepack.look/packageinfo.json')));
  assert.deepStrictEqual(fs.readdirSync(lookApp).sort(), ['appinfo.json', 'icon.png', 'index.html', 'largeIcon.png', 'stub.js', 'targets.js']);
  const info = JSON.parse(fs.readFileSync(path.join(lookApp, 'appinfo.json'), 'utf8'));
  assert.strictEqual(info.id, 'dev.themepack.look');
  assert.notStrictEqual(info.visible, false, 'the Look icon stays on Home');
  assert.strictEqual(info.transparent, true);
});

test('the Look app opens our Settings at its Look page and closes, whatever it is launched with', () => {
  for (const params of [undefined, '{}', '{"target":"network"}']) {
    const did = launch(params, { dir: lookApp });
    assert.strictEqual(did.calls[0].uri, URI);
    assert.deepStrictEqual(did.calls[0].params, { target: 'Look' }, String(params));
    did.answer(0);
    assert.strictEqual(did.closed, 1);
  }
});
