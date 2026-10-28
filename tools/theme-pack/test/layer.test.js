const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The QML layer's tests run in the offscreen preview harness, on a Qt 5 `qml` tool (QML_BIN, default qml-qt5).
const dir = path.join(__dirname, '..');
const QML = process.env.QML_BIN || 'qml-qt5';
// Looked up on PATH rather than run: `qml --help` with no display aborts and leaves a core file.
const haveQml = QML.indexOf('/') >= 0 ? fs.existsSync(QML) : (process.env.PATH || '').split(path.delimiter)
  .some((d) => { try { fs.accessSync(path.join(d, QML), fs.constants.X_OK); return true; } catch (e) { return false; } });

function runScene(file) {
  return spawnSync(QML, [path.join(dir, 'preview/tests', file)], {
    encoding: 'utf8', timeout: 20000,
    env: Object.assign({}, process.env, {
      QT_FORCE_STDERR_LOGGING: '1', QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software',
      QML2_IMPORT_PATH: path.join(dir, 'preview/mocks') + path.delimiter + path.join(dir, 'ui')
    })
  });
}

test('the layer claims on-demand LG items when LG shows them, and lets go when LG destroys them', { skip: !haveQml && QML + ' not found' }, () => {
  const r = runScene('LateClaims.qml');
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/late claims: all passed/.test(out), out);
  assert.ok(!/FAIL /.test(out), out);
});

test('Look asks for our Settings only on a new open request, never on a subscription\'s first answer', { skip: !haveQml && QML + ' not found' }, () => {
  const r = runScene('SettingsRequests.qml');
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/settings requests: all passed/.test(out), out);
  assert.ok(!/FAIL /.test(out), out);
});

test('the input picker keeps LG\'s hit areas: our tiles and add-on button sit over LG\'s in every state', { skip: !haveQml && QML + ' not found' }, () => {
  const r = runScene('InputPickerHits.qml');
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/input picker hits: all passed/.test(out), out);
  assert.ok(!/FAIL /.test(out), out);
});

test('components paint in passes, the focused one lifted, attachments last, children inside their parent\'s origin', { skip: !haveQml && QML + ' not found' }, () => {
  const r = runScene('Passes.qml');
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/passes: all passed/.test(out), out);
  assert.ok(!/FAIL /.test(out), out);
  assert.ok(!/\.qml:\d+/.test(out), 'QML warnings:\n' + out);
});
