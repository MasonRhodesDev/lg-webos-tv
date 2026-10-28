// Builds tv-qml.json, the QML modules and directories the TV's compositor can import, for test/qml-compat.test.js.
//
//   ssh root@$TV_HOST 'find /usr/lib/qt5/qml' > files.txt
//   ssh root@$TV_HOST 'for f in $(find /usr/lib/qt5/qml -name qmldir); do echo "=== $f"; cat "$f"; done' > qmldirs.txt
//   node tv-qml-inventory.mjs files.txt qmldirs.txt > tv-qml.json
//
// files.txt may also be a listing of an extracted firmware image: everything before /usr/lib/qt5/qml is dropped.
// qmldirs.txt may cover only some modules. A module's versions come from the type lines of its qmldir; a plugin
// module's qmldir has none (they live in its plugins.qmltypes), so Qt's own modules take the versions Qt 5.6 ships,
// and any other module whose versions are unknown gets `versions: null` (the name is checked, the version is not).
import fs from 'node:fs';

const ROOT = '/usr/lib/qt5/qml';
// Qt 5.6's module versions: the highest minor of each major.
const QT56 = {
  'QtQuick': { 2: 6 }, 'QtQuick.Window': { 2: 2 }, 'QtQml': { 2: 2 }, 'QtQml.Models': { 2: 2 },
  'QtQml.StateMachine': { 1: 0 }, 'QtGraphicalEffects': { 1: 0 }, 'QtQuick.Particles': { 2: 0 },
  'QtQuick.LocalStorage': { 2: 0 }, 'QtQuick.XmlListModel': { 2: 0 }, 'QtQuick.Layouts': { 1: 3 },
  'QtQuick.Controls': { 1: 5 }, 'QtQuick.Controls.Styles': { 1: 4 }, 'QtQuick.Dialogs': { 1: 2 },
  'QtQuick.Extras': { 1: 4 }, 'QtMultimedia': { 5: 6 }, 'QtTest': { 1: 1 }, 'QtSensors': { 5: 2 },
  'Qt.labs.folderlistmodel': { 2: 1 }, 'Qt.labs.settings': { 1: 0 }
};

// Registered from C++ by the compositor binary, so no qmldir; LG's own QML imports it at this version.
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
  // An import resolves by path: QtQuick.2/ answers `import QtQuick 2.x`, QtQuick/Window.2/ `import QtQuick.Window 2.x`.
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
