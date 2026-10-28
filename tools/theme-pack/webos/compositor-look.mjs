#!/usr/bin/env node
// Builds the compositor's side of Look from your own copy of the stock QML (webOS 4.5):
//   SystemUIAssets/  LG's style-override module plus the ThemePack singleton, with StyleYSM bound to it
//   InputPicker/Style.qml  the input picker's colours bound to ThemePack
// Every edit is an anchored replacement that must match exactly once.
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function arg(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; }
const qml = arg('qml'), out = arg('out');
if (!qml || !out) { console.error('usage: compositor-look.mjs --qml STOCK_QT5_QML_DIR --out DIR'); process.exit(2); }

function replaceOnce(src, anchor, replacement, what) {
  const n = src.split(anchor).length - 1;
  if (n !== 1) throw new Error(`${what}: expected the anchor once, found ${n}`);
  return src.replace(anchor, replacement);
}
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');
const sources = ['SystemUIAssets/StyleYSM.qml', 'SystemUIAssets/qmldir', 'InputPicker/Style.qml'];

cpSync(join(qml, 'SystemUIAssets'), join(out, 'SystemUIAssets'), { recursive: true });
copyFileSync(join(here, 'qml', 'ThemePack.qml'), join(out, 'SystemUIAssets', 'ThemePack.qml'));

const qmldir = join(out, 'SystemUIAssets', 'qmldir');
writeFileSync(qmldir, readFileSync(qmldir, 'utf8').trimEnd() + '\nsingleton ThemePack 1.0 ThemePack.qml\n');

const ysm = join(out, 'SystemUIAssets', 'StyleYSM.qml');
let s = readFileSync(ysm, 'utf8');
// A module's own files do not see its singletons without importing the module.
s = replaceOnce(s, 'import QtQuick 2.4', 'import QtQuick 2.4\nimport SystemUIAssets 1.0', 'import');
s = replaceOnce(s, 'property color defaultFocusColor: "#cf0652"', 'property color defaultFocusColor: ThemePack.focus', 'focus colour');
s = replaceOnce(s, '        property int iconRightMargin: 12\n    }',
  '        property int iconRightMargin: 12\n        property string barBgColor: ThemePack.trackRgb\n        property real barBgOpacity: ThemePack.trackOpacity\n        property color textColor: ThemePack.ink\n    }', 'volume colours');
writeFileSync(ysm, s);

mkdirSync(join(out, 'InputPicker'), { recursive: true });
let ip = readFileSync(join(qml, 'InputPicker', 'Style.qml'), 'utf8');
ip = replaceOnce(ip, 'import QtQuick', 'import SystemUIAssets 1.0\nimport QtQuick', 'import');
ip = replaceOnce(ip, 'property color focusColor: isSupportBNO ? "#68819b" : "#cf0652"', 'property color focusColor: isSupportBNO ? "#68819b" : ThemePack.focus', 'focus');
ip = replaceOnce(ip, 'property color rootBgColor: "#121212"', 'property color rootBgColor: ThemePack.panel', 'background');
ip = replaceOnce(ip, 'property color tileActBgColor: "#8f8f8f"', 'property color tileActBgColor: ThemePack.tileActive', 'active tile');
ip = replaceOnce(ip, 'property color tileInactBgColor: "#222222"', 'property color tileInactBgColor: ThemePack.tile', 'tile');
ip = replaceOnce(ip, 'property color tileSelectedMarkColor: "#cf0652"', 'property color tileSelectedMarkColor: ThemePack.current', 'selected mark');
writeFileSync(join(out, 'InputPicker', 'Style.qml'), ip);

writeFileSync(join(out, '.stock.md5'), sources.map((f) => md5(join(qml, f)) + '  ' + f).join('\n') + '\n');
console.log('compositor look built: StyleYSM, ThemePack, InputPicker/Style.qml');
