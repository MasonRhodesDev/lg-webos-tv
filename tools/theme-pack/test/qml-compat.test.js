const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const lint = require('./lib/qml-compat.js');

const ui = path.join(__dirname, '..', 'ui');
const none = () => false;
const messages = (src, file) => lint.checkSource(src, file || 'x.qml', none).map((p) => p.line + ': ' + p.message);

test('ui/ runs on the TV: ES5 only, imports the TV resolves, no Qt 5.7+ types', () => {
  const problems = lint.checkTree(ui);
  assert.deepStrictEqual(problems, [], '\n' + problems.join('\n'));
});

test('the lint catches ES2015+ in code', () => {
  const src = [
    'import QtQuick 2.4',
    'Item {',
    '    function a() { let x = 1; const y = 2; return [x, y].map((v) => v); }',
    '    property string s: `t`',
    '    function b(n = 1) { var o = Object.assign({}, {}); return [].includes(n) || f(...o); }',
    '    function c() { for (var k of o) {} var { p } = o; return o?.p ?? 2 ** 3; }',
    '}'
  ].join('\n');
  const m = messages(src);
  ['let', 'const', 'arrow', 'template', 'default parameter', 'Object method', 'includes', 'spread', 'for...of',
   'destructuring', 'optional chaining', 'exponent'].forEach((w) => assert.ok(m.some((x) => x.indexOf(w) >= 0), w + ' not caught: ' + m.join('; ')));
  assert.ok(m.some((x) => /^3: `let`/.test(x)), 'line numbers: ' + m.join('; '));
});

test('the lint ignores comments, strings and regex literals', () => {
  const src = [
    'import QtQuick 2.4',
    '// let x = () => `y`; const z',
    '/* class A { ...b } */',
    'Item {',
    '    property string s: "let me => see `this` ...more"',
    '    property var r: /^(#|rgb)\\/\\/ "let" `const`/.test(s)',
    '    function f(a, b) { return a / b / 2; }',
    '    property string t: \'const => it\'',
    '}'
  ].join('\n');
  assert.deepStrictEqual(messages(src), []);
});

test('the lint checks imports against the TV\'s module inventory', () => {
  const m = messages([
    'import QtQuick 2.7',
    'import QtQuick.Controls 2.0',
    'import QtQuick.Shapes 1.0',
    'import NoSuchModule 1.0',
    'import QtGraphicalEffects 1.0',
    'import QtQuick.Window 2.2',
    'import WebOSServices 1.0',
    'import "file:///usr/lib/qt5/qml/YSM" as LG',
    'import "file:///usr/lib/qt5/qml/YSM/Common/FocusHandler.js" as FH',
    'import "file:///usr/lib/qt5/qml/Nope" as N',
    'Item { Shape {} containmentMask: null }'
  ].join('\n'));
  assert.deepStrictEqual(m.map((x) => Number(x.split(':')[0])), [1, 2, 3, 4, 10, 11, 11], m.join('\n'));
});
