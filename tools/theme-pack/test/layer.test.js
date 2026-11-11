const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The QML layer's tests run in the offscreen preview harness, on a Qt 5 `qml` tool (QML_BIN, default qml-qt5).
const dir = path.join(__dirname, '..');
const QML = process.env.QML_BIN || 'qml-qt5';
// Looked up on PATH rather than run: `qml --help` with no display aborts and leaves a core file.
const haveQml = QML.indexOf('/') >= 0 ? fs.existsSync(QML) : (process.env.PATH || '').split(path.delimiter)
  .some((d) => { try { fs.accessSync(path.join(d, QML), fs.constants.X_OK); return true; } catch (e) { return false; } });

function runScene(file, args) {
  return spawnSync(QML, [path.join(dir, 'preview/tests', file)].concat(args ? ['--'].concat(args) : []), {
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

test('themes off leaves ±1 empty; later themes wrap further out; chips, thumbs and knobs are dressed; disabled decoration recedes', { skip: !haveQml && QML + ' not found' }, () => {
  const r = runScene('Decoration.qml');
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/decoration: all passed/.test(out), out);
  assert.ok(!/FAIL /.test(out), out);
  assert.ok(!/\.qml:\d+/.test(out), 'QML warnings:\n' + out);
});

test('the injector puts the layer under LG\'s root from inside the running compositor, outlived by it, replaces a loaded one, and keeps it when the new one does not compile', { skip: !haveQml && QML + ' not found' }, () => {
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'themepack-broken-ui-'));
  try {
    fs.cpSync(path.join(dir, 'ui'), broken, { recursive: true });
    fs.appendFileSync(path.join(broken, 'Look/Layer.qml'), '\n}}}\n');
    const r = runScene('Inject.qml', [broken]);
    const out = r.stdout + r.stderr;
    assert.strictEqual(r.status, 0, out);
    assert.ok(/inject: all passed/.test(out), out);
    assert.ok(!/FAIL /.test(out), out);
  } finally {
    fs.rmSync(broken, { recursive: true, force: true });
  }
});

// The Look service's answer for one style, as service/service.js's payload() builds it.
function stylePayload(id) {
  const style = require(path.join(dir, 'packs/styles', id + '.js'));
  return JSON.stringify({ returnValue: true, look: { style: id, themes: [] }, style, themes: [] });
}

for (const id of fs.readdirSync(path.join(dir, 'packs/styles')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''))) {
  test('a list opens at its top unless its focused row is below the fold: ' + id, { skip: !haveQml && QML + ' not found' }, () => {
    const r = runScene('ListOpens.qml', [stylePayload(id)]);
    const out = r.stdout + r.stderr;
    assert.strictEqual(r.status, 0, out);
    assert.ok(/list opens: all passed/.test(out), out);
    assert.ok(!/FAIL /.test(out), out);
  });
}

// The Home dock's test scene needs remote keys, so it runs under Qt 5's qmltestrunner (QML_TEST_BIN, as
// test/settings.test.js).
function onPath(name) {
  if (name.indexOf('/') >= 0) return fs.existsSync(name) ? name : null;
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    try { fs.accessSync(path.join(d, name), fs.constants.X_OK); return path.join(d, name); } catch (e) { /* next */ }
  }
  return null;
}
const testRunner = process.env.QML_TEST_BIN ? onPath(process.env.QML_TEST_BIN) : onPath('qmltestrunner-qt5') || onPath('qmltestrunner');

test('the Home dock: key filter in and out of LG\'s chain, our table entry, open, move, switch, Back, a second Home, a new app in front, the popup plane shared with Settings, retire', { skip: !testRunner && 'qmltestrunner not found' }, () => {
  const r = spawnSync(testRunner, ['-import', path.join(dir, 'preview/mocks'), '-import', path.join(dir, 'ui'),
    '-input', path.join(dir, 'preview/tests/tst_HomeDock.qml')], {
    encoding: 'utf8', timeout: 60000,
    env: Object.assign({}, process.env, { QT_FORCE_STDERR_LOGGING: '1', QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' })
  });
  const out = r.stdout + r.stderr;
  assert.strictEqual(r.status, 0, out);
  assert.ok(/Totals: \d+ passed, 0 failed/.test(out), out);
  const warnings = out.split('\n').filter((l) => /\.(qml|js):\d+/.test(l) && !/^\s*Loc:/.test(l));
  assert.deepStrictEqual(warnings, []);
});

// The compositor's Qt (5.6) still calls a function that is connected to a signal after the object the function
// belongs to is destroyed, in a QML context that is gone; the first singleton such a function names takes the
// compositor down. A desk Qt drops such a connection by itself, so no scene here can show it. This reads the source
// instead: each `X.connect(f)` in ui/ has its `X.disconnect(f)` in the same file, unless X belongs to the object
// that connects (it is destroyed with it).
const OWNED = {
  'Look/Layer.qml': { 'source': 'link(), undone by unlink()', 'part.probeChanged': 'a part the layer made' },
  'Look/parts/Settings.qml': {
    'store.systemUiRequested': 'its own store', 'store.failed': 'its own store', 'store.refused': 'its own store',
    'store.succeeded': 'its own store', 'hook.appliedChanged': 'the hook it made'
  },
  'Look/settings/Store.qml': {
    'get.response': 0, 'd.response': 0, 'net.response': 0, 'vol.response': 0, 'sig.response': 0, 'sys.response': 0,
    'os.response': 0, 'kit.response': 0, 'prefs.response': 0, 'clk.response': 0, 'fmt.response': 0, 'tz.response': 0,
    'st.response': 0, 'scan.response': 0, 'dev.response': 0, 's.response': 0 // bus objects the store makes and drops
  }
};
function qmlFiles(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? qmlFiles(path.join(d, e.name))
    : /\.(qml|js)$/.test(e.name) ? [path.join(d, e.name)] : []);
}
test('nothing in ui/ stays connected to what outlives it: every connect has its disconnect, or is to its own object', () => {
  const ui = path.join(dir, 'ui');
  const problems = [], used = {};
  for (const file of qmlFiles(ui)) {
    const rel = path.relative(ui, file), src = fs.readFileSync(file, 'utf8');
    const code = src.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
    for (const m of code.matchAll(/([A-Za-z_][\w.]*)\.connect\(\s*([\w.]+\s*\)|function\b)/g)) {
      const from = m[1], to = m[2].replace(/\s*\)$/, '');
      if (OWNED[rel] && from in OWNED[rel]) { used[rel + ' ' + from] = true; continue; }
      if (to !== 'function' && code.includes(from + '.disconnect(' + to + ')')) continue;
      problems.push(rel + ': ' + from + '.connect(' + (to === 'function' ? 'function ...' : to) + ') is never disconnected');
    }
  }
  for (const rel of Object.keys(OWNED)) for (const from of Object.keys(OWNED[rel]))
    if (!used[rel + ' ' + from]) problems.push(rel + ': ' + from + ' is listed as its own object, but nothing connects to it');
  assert.deepStrictEqual(problems, [], '\n' + problems.join('\n'));
});
