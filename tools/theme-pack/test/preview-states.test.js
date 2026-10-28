const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The preview renders a scene's base state as well as the states it declares, so a new state never drops base shots.
test('a scene with states still renders its base state, unless it opts out', async () => {
  const { shotStates } = await import(pathToFileURL(path.join(__dirname, '..', 'preview', 'states.mjs')).href);
  assert.deepStrictEqual(shotStates({ states: [] }), ['']);
  assert.deepStrictEqual(shotStates({ states: ['a', 'b'] }), ['', 'a', 'b']);
  assert.deepStrictEqual(shotStates({ states: ['a'], base: true }), ['', 'a']);
  assert.deepStrictEqual(shotStates({ states: ['a'], base: false }), ['a']);
  assert.deepStrictEqual(shotStates({ states: [], base: false }), [''], 'a scene with no states always has its base');
});

test('render.mjs takes its states from shotStates and Shot.qml reports the opt-out', () => {
  const fs = require('node:fs');
  const render = fs.readFileSync(path.join(__dirname, '..', 'preview', 'render.mjs'), 'utf8');
  assert.ok(!/states\.length \? info\[s\]\.states/.test(render), 'render.mjs picks states itself');
  assert.strictEqual((render.match(/shotStates\(info\[s\]\)/g) || []).length, 2);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'preview', 'Shot.qml'), 'utf8'), /"base": scene\.baseShot !== false/);
});
