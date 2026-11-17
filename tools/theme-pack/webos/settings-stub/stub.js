var SettingsStub = (function () {
  'use strict';
  var URI = 'luna://dev.themepack.look.service/openSettings';
  var RETRY_MS = 1000;
  var GIVE_UP_MS = 3000;

  function parse(params) {
    if (params && typeof params === 'object') return params;
    try { return JSON.parse(params || '{}') || {}; } catch (e) { return {}; }
  }

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
    win.document.addEventListener('webOSRelaunch', function (e) {
      forward(e && e.detail ? e.detail : win.PalmSystem && win.PalmSystem.launchParams, env);
    });
  }

  return { pageFor: pageFor, forward: forward, start: start };
})();

if (typeof window !== 'undefined' && window.PalmServiceBridge) SettingsStub.start(window);
