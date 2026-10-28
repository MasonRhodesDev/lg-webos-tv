// Settings stub: mounted over LG's Settings app, so every launch of com.palm.app.settings (the Home tile, deep links
// from LG's apps) asks our layer to open our Settings at the page the caller wanted, then closes. It draws nothing.
// Runs in the TV's Chromium 53: ES5 only. SETTINGS_TARGETS (targets.js, built from settings/catalog.json) maps LG's
// deep-link target names to our page ids. The Look app is the same page with no targets and SETTINGS_PAGE "Look":
// the page to open when the launch names none (tv/build-ipk.sh).
var SettingsStub = (function () {
  'use strict';
  var URI = 'luna://dev.themepack.look.service/openSettings';
  // A cold start of the service drops the call that woke it, so an unanswered call is sent once more.
  var RETRY_MS = 1000;
  // Never linger: an invisible app left running would hold LG's Settings slot.
  var GIVE_UP_MS = 3000;

  function parse(params) {
    if (params && typeof params === 'object') return params;
    try { return JSON.parse(params || '{}') || {}; } catch (e) { return {}; }
  }

  // Our page for LG's launch params: the mapped target, or '' (the top of our Settings) when there is none or LG's
  // name is one we don't know.
  function pageFor(params, targets) {
    var t = parse(params).target;
    return typeof t === 'string' && Object.prototype.hasOwnProperty.call(targets, t) ? targets[t] : '';
  }

  function forward(params, env) {
    var page = pageFor(params, env.targets) || env.page || '', done = false, bridges = [];
    function finish() {
      if (done) return;
      done = true;
      env.close();
    }
    function send() {
      // Kept referenced until the answer: a collected bridge drops its call.
      var bridge = new env.Bridge();
      bridge.onservicecallback = finish;
      bridges.push(bridge);
      bridge.call(URI, JSON.stringify(page ? { target: page } : {}));
    }
    send();
    env.setTimeout(function () { if (!done) send(); }, RETRY_MS);
    env.setTimeout(finish, GIVE_UP_MS);
  }

  function start(win) {
    var env = {
      targets: win.SETTINGS_TARGETS || {},
      page: win.SETTINGS_PAGE,
      Bridge: win.PalmServiceBridge,
      close: function () { win.close(); },
      setTimeout: function (fn, ms) { return win.setTimeout(fn, ms); }
    };
    forward(win.PalmSystem && win.PalmSystem.launchParams, env);
    // A launch while the stub is still running arrives as a relaunch.
    win.document.addEventListener('webOSRelaunch', function (e) {
      forward(e && e.detail ? e.detail : win.PalmSystem && win.PalmSystem.launchParams, env);
    });
  }

  return { pageFor: pageFor, forward: forward, start: start };
})();

if (typeof window !== 'undefined' && window.PalmServiceBridge) SettingsStub.start(window);
