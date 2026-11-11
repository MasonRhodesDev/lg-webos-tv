const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ui/home-key.js in a stand-in for LG's key filter scope: the key and policy constants, a bus caller that records,
// the application manager wrapper and the access flags LG's own Home handling consults.
const src = fs.readFileSync(path.join(__dirname, '..', 'ui', 'home-key.js'), 'utf8');
const HOME = 0x01000053; // Qt.Key_Super_L
const OTHER = { Menu: 0x01000055, Back: 0x01200001, Up: 0x01000013, Return: 0x01000004 };

function scope(over) {
  const s = {
    Qt: { Key_Super_L: HOME },
    KeyPolicy: { NextPolicy: 'next', Accepted: 'accepted', NotAccepted: 'not-accepted' },
    sent: [], launched: [], now: 1000,
    lunaCall: { appId: 'test', send(service, method, payload, cb) { s.sent.push({ service, method, payload: JSON.parse(payload), cb }); } },
    applicationManager: {
      launch(id, params) { s.launched.push({ how: 'launch', id, params: JSON.parse(params) }); },
      launchDefaultApp(id, params) { s.launched.push({ how: 'default', id, params: JSON.parse(params) }); }
    },
    global: { prepareToGoHome() { s.prepared = (s.prepared || 0) + 1; } },
    modalAlert: { visible: false },
    access: { ribbon: true },
    overlayView: { access: { ribbon: true } },
    homeView: { visible: false },
    settingsService: { disableHome: false, getLaunchDefaultApp: '' },
    bootManager: { bootFirstUse: false },
    systemPropertyService: { powerOnlyMode: false },
    JSON
  };
  Object.assign(s, over || {});
  // The handler reads the clock through Date; the scope's Date is driven by the test.
  s.Date = function () { return { getTime: () => s.now }; };
  vm.createContext(s);
  vm.runInContext(src, s);
  s.key = (key, pressed, autoRepeat) => s.themepackHandleHome(key, pressed, !!autoRepeat);
  s.press = (ms) => { const a = s.key(HOME, true); s.now += ms; const b = s.key(HOME, false); return [a, b]; };
  return s;
}

test('home-key.js defines init and its handler and nothing outside the themepack prefix', () => {
  const s = scope();
  assert.strictEqual(typeof s.init, 'function');
  assert.strictEqual(typeof s.themepackHandleHome, 'function');
  const names = (src.match(/^(?:function|var)\s+([\w$]+)/gm) || []).map((d) => d.split(/\s+/)[1]);
  assert.ok(names.length > 0);
  for (const n of names) assert.ok(n === 'init' || /^themepack/.test(n), n + ' is not prefixed');
});

test('every other key goes on to the next filter, pressed, released or repeating', () => {
  const s = scope();
  for (const k of Object.values(OTHER)) {
    assert.strictEqual(s.key(k, true), 'next');
    assert.strictEqual(s.key(k, true, true), 'next');
    assert.strictEqual(s.key(k, false), 'next');
  }
  assert.strictEqual(s.sent.length + s.launched.length, 0);
});

test('a short press of Home is taken and asks the system UI manager for our dock', () => {
  const s = scope();
  assert.deepStrictEqual(s.press(150), ['accepted', 'accepted']);
  assert.strictEqual(s.sent.length, 1);
  assert.strictEqual(s.sent[0].service, 'com.webos.service.systemUIManager');
  assert.strictEqual(s.sent[0].method, '/launch');
  assert.deepStrictEqual(s.sent[0].payload, { appId: 'dev.themepack.home' });
  assert.strictEqual(s.launched.length, 0);
  // The manager says yes: nothing more happens.
  s.sent[0].cb(JSON.stringify({ returnValue: true }));
  assert.strictEqual(s.launched.length, 0);
});

test('repeats of a held Home are taken, and a long hold opens LG\'s Home on release', () => {
  const s = scope();
  assert.strictEqual(s.key(HOME, true), 'accepted');
  s.now += 400;
  assert.strictEqual(s.key(HOME, true, true), 'accepted');
  s.now += 700;
  assert.strictEqual(s.key(HOME, false), 'accepted');
  assert.strictEqual(s.sent.length, 0);
  assert.deepStrictEqual(s.launched, [{ how: 'default', id: 'com.webos.app.home', params: { category: 'home' } }]);
  assert.strictEqual(s.prepared, 1);
});

test('LG\'s Home honours a default app the settings name, as LG\'s own short press does', () => {
  const s = scope({ settingsService: { disableHome: false, getLaunchDefaultApp: 'com.webos.app.fullhome' } });
  s.press(1500);
  assert.deepStrictEqual(s.launched, [{ how: 'launch', id: 'com.webos.app.fullhome', params: { launchType: 'homeKey' } }]);
});

test('whenever LG would not open Home, Home goes on to LG untouched', () => {
  const cases = {
    'a modal alert': { modalAlert: { visible: true } },
    'the ribbon off': { access: { ribbon: false } },
    'an overlay turned the ribbon off': { overlayView: { access: { ribbon: false } } },
    'Home disabled': { settingsService: { disableHome: true, getLaunchDefaultApp: '' } },
    'first-use setup': { bootManager: { bootFirstUse: true } },
    'LG\'s Home showing': { homeView: { visible: true } }
  };
  for (const [what, over] of Object.entries(cases)) {
    const s = scope(over);
    assert.deepStrictEqual(s.press(100), ['next', 'next'], what);
    assert.strictEqual(s.key(HOME, true, true), 'next', what + ': repeats too');
    assert.strictEqual(s.sent.length + s.launched.length, 0, what);
  }
  // Power-only mode during first use: LG opens Home, so we do too.
  const s = scope({ bootManager: { bootFirstUse: true }, systemPropertyService: { powerOnlyMode: true } });
  assert.deepStrictEqual(s.press(100), ['accepted', 'accepted']);
});

test('the decision is made on the press: a release follows it even if the flags change in between', () => {
  const s = scope();
  assert.strictEqual(s.key(HOME, true), 'accepted');
  s.modalAlert.visible = true;
  assert.strictEqual(s.key(HOME, false), 'accepted');
  assert.strictEqual(s.sent.length, 1);
  // And a press passed on has its release passed on.
  s.sent.length = 0;
  assert.strictEqual(s.key(HOME, true), 'next');
  s.modalAlert.visible = false;
  assert.strictEqual(s.key(HOME, false), 'next');
  assert.strictEqual(s.sent.length, 0);
});

test('a failed or unreadable reply from the system UI manager opens LG\'s Home', () => {
  for (const reply of [JSON.stringify({ returnValue: false }), '{}', 'not json']) {
    const s = scope();
    s.press(100);
    s.sent[0].cb(reply);
    assert.deepStrictEqual(s.launched.map((l) => l.id), ['com.webos.app.home'], reply);
  }
});

test('a throw never costs a key: a press goes on to LG, a release of ours opens LG\'s Home', () => {
  // The flags throw on the press.
  const s = scope({ modalAlert: null });
  assert.strictEqual(s.key(HOME, true), 'next');
  assert.strictEqual(s.key(HOME, false), 'next', 'its release goes on with it');
  // The bus caller throws on the release.
  const t = scope();
  t.lunaCall.send = () => { throw new Error('bus down'); };
  assert.deepStrictEqual(t.press(100), ['accepted', 'accepted']);
  assert.deepStrictEqual(t.launched.map((l) => l.id), ['com.webos.app.home']);
  // Everything throws: still a policy, never an exception.
  const u = scope({ modalAlert: null, applicationManager: null, global: null });
  assert.strictEqual(u.key(HOME, true), 'next');
  u.themepackPressedAt = 5;
  assert.strictEqual(u.key(HOME, false), 'accepted');
});
