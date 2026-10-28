// Look bridge for the stock Settings app: subscribes to the Look service and sets the CSS variables the
// patched main.css reads. If the service never answers, the variables keep their stock values.
(function () {
  'use strict';
  var URI = 'luna://dev.themepack.look.service/';
  var VARS = { focus: '--tp-focus', 'focus-ink': '--tp-focus-ink' };
  var listeners = [];
  // A warm-up launch at boot loads the app out of sight and closes it into keep-alive, so the first real open is instant.
  var warm = false;
  try { warm = !!JSON.parse((window.PalmSystem && window.PalmSystem.launchParams) || '{}').themepackWarm; } catch (e) { warm = false; }
  if (warm) document.documentElement.style.visibility = 'hidden';
  var latest = null;

  function apply(msg) {
    var tokens = msg && msg.style && msg.style.tokens;
    if (!tokens) return;
    Object.keys(VARS).forEach(function (k) {
      if (tokens[k]) document.documentElement.style.setProperty(VARS[k], tokens[k]);
    });
  }

  function call(method, params, onReply) {
    var bridge = new window.PalmServiceBridge();
    bridge.onservicecallback = function (text) {
      var msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      onReply(msg, bridge);
    };
    bridge.call(URI + method, JSON.stringify(params || {}));
    return bridge;
  }

  // A cold service drops the call that starts it, so retry until the first reply arrives.
  function subscribe(attempt) {
    var answered = false;
    var bridge = call('getLook', { subscribe: true }, function (msg) {
      answered = true;
      if (!msg.returnValue) return;
      latest = msg;
      apply(msg);
      listeners.forEach(function (fn) { fn(msg); });
    });
    setTimeout(function () {
      if (!answered && attempt < 5) { try { bridge.cancel(); } catch (e) { /* already closed */ } subscribe(attempt + 1); }
    }, 3000);
    window.__themepackBridge = bridge;
  }

  window.__themepack = {
    current: function () { return latest; },
    onChange: function (fn) {
      listeners.push(fn);
      if (latest) fn(latest);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    setLook: function (look, done) {
      call('setLook', look, function (msg) { if (done) done(msg); });
    }
  };

  // Report how long the page took to reach a mounted app, so the cost of skipping the V8 snapshot can be measured.
  function reportLoad() {
    var root = document.getElementById('root');
    if (root && root._reactRootContainer) {
      var ms = Math.round(Date.now() - window.performance.timing.navigationStart);
      call('getLook', { loadMs: ms }, function () {});
      if (warm) setTimeout(function () { document.documentElement.style.visibility = ''; window.close(); }, 300);
      return;
    }
    setTimeout(reportLoad, 50);
  }

  // The patched app cannot use its V8 snapshot, so a cold open takes seconds. Ask WAM to keep it resident: closing
  // then hides it and the next open is instant. Without the call, the app simply closes as before.
  try {
    if (window.PalmSystem && typeof window.PalmSystem.keepAlive === 'function') window.PalmSystem.keepAlive(true);
  } catch (e) { /* not supported: normal close */ }

  if (window.PalmServiceBridge) subscribe(0);
  if (window.PalmServiceBridge) reportLoad();
})();
