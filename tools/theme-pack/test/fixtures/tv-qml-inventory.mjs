import fs from 'node:fs';

const ROOT = '/usr/lib/qt5/qml';
const QT56 = {
  'QtQuick': { 2: 6 }, 'QtQuick.Window': { 2: 2 }, 'QtQml': { 2: 2 }, 'QtQml.Models': { 2: 2 },
  'QtQml.StateMachine': { 1: 0 }, 'QtGraphicalEffects': { 1: 0 }, 'QtQuick.Particles': { 2: 0 },
  'QtQuick.LocalStorage': { 2: 0 }, 'QtQuick.XmlListModel': { 2: 0 }, 'QtQuick.Layouts': { 1: 3 },
  'QtQuick.Controls': { 1: 5 }, 'QtQuick.Controls.Styles': { 1: 4 }, 'QtQuick.Dialogs': { 1: 2 },
  'QtQuick.Extras': { 1: 4 }, 'QtMultimedia': { 5: 6 }, 'QtTest': { 1: 1 }, 'QtSensors': { 5: 2 },
  'Qt.labs.folderlistmodel': { 2: 1 }, 'Qt.labs.settings': { 1: 0 }
};

const COMPOSITOR = { 'WebOSCoreCompositor': { 1: 0 } };

const [filesTxt, qmldirsTxt] = process.argv.slice(2);
const files = fs.readFileSync(filesTxt, 'utf8').split('\n')
  .map((l) => { const i = l.indexOf(ROOT); return i < 0 ? '' : l.slice(i).trim(); })
  .filter(Boolean);

const qmldirs = {};
let cur = null;
for (const line of fs.readFileSync(qmldirsTxt, 'utf8').split('\n')) {
  const m = /^=== (.*)$/.exec(line);
  if (m) { const i = m[1].indexOf(ROOT); cur = m[1].slice(i).replace(/\/qmldir$/, ''); qmldirs[cur] = []; continue; }
  if (cur) qmldirs[cur].push(line);
}

const dirs = {};
for (const f of files) {
  const m = /^(.*)\/([^/]+\.(qml|js))$/.exec(f);
  if (m) (dirs[m[1]] = dirs[m[1]] || []).push(m[2]);
}
for (const d in dirs) dirs[d].sort();

const modules = {};
for (const f of files.filter((p) => /\/qmldir$/.test(p)).sort()) {
  const dir = f.replace(/\/qmldir$/, '');
  if (dir === ROOT) continue;
  const name = dir.slice(ROOT.length + 1).split('/').map((p) => p.replace(/\.\d+$/, '')).join('.');
  let versions = null, source = 'unknown';
  const lines = qmldirs[dir];
  if (lines) {
    const v = {};
    for (const l of lines) {
      const t = l.trim().split(/\s+/);
      const at = t[0] === 'singleton' ? 2 : 1;
      const vm = /^(\d+)\.(\d+)$/.exec(t[at] || '');
      if (vm && t[0] !== 'module' && t[0] !== 'plugin') v[vm[1]] = Math.max(v[vm[1]] || 0, Number(vm[2]));
    }
    if (Object.keys(v).length) { versions = v; source = 'qmldir'; }
  }
  if (!versions && QT56[name]) { versions = QT56[name]; source = 'qt-5.6'; }
  modules[name] = { versions, source };
}

for (const name in COMPOSITOR) modules[name] = { versions: COMPOSITOR[name], source: 'compositor' };

process.stdout.write(JSON.stringify({ qt: '5.6.2', root: ROOT, modules, dirs }, null, 1) + '\n');
