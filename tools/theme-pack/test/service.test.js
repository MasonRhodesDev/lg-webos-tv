const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = path.join(__dirname, '..');

// The service as the package installs it: service.js next to its exported packs and a writable data/, with a stand-in
// for webos-service that records the registered methods so a test can call them as the bus would.
function start() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'look-service-'));
  fs.copyFileSync(path.join(dir, 'service', 'service.js'), path.join(root, 'service.js'));
  execFileSync('node', [path.join(dir, 'export-json.mjs'), path.join(root, 'packs')]);
  fs.mkdirSync(path.join(root, 'data'));
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
  return { call };
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

test('settings requests leave the picker alone, and the other way round', () => {
  const { call } = start();
  call('openPicker');
  const r = call('openSettings', { target: 'Sound' });
  assert.strictEqual(r[0].picker.open, true);
  const p = call('closePicker');
  assert.strictEqual(p[0].settings.open, true);
  assert.strictEqual(p[0].settings.target, 'Sound');
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
