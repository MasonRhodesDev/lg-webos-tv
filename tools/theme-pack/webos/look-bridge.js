// Look bridge for the stock Settings app: subscribes to the Look service and sets the CSS variables the
// patched main.css reads. If the service never answers, the variables keep their stock values.
(function () {
  'use strict';
  var URI = 'luna://dev.themepack.look.service/';
  var VARS = { focus: '--tp-focus', 'focus-ink': '--tp-focus-ink' };
  var listeners = [];
  // A warm-up launch at boot loads the app out of sight and leaves it hidden but running, so the first real open is
  // instant. The page stays blank until it is hidden, so nothing shows; closing would end the app, so it is hidden.
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

  // Bridges are kept referenced: a collected bridge ends its subscription.
  function call(uri, params, onReply) {
    var bridge = new window.PalmServiceBridge();
    bridge.onservicecallback = function (text) {
      var msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      onReply(msg, bridge);
    };
    bridge.call(uri, JSON.stringify(params || {}));
    return bridge;
  }

  function receive(msg) {
    if (!msg.returnValue || !msg.style) return;
    latest = msg;
    apply(msg);
    listeners.forEach(function (fn) { fn(msg); });
  }

  // A subscription ends when the service restarts, so subscribe again each time it appears on the bus. While it is
  // away, a plain call every 5 s starts it (the service starts on demand).
  var online = false, sub = null, wakeTimer = null;
  function wake() {
    wakeTimer = null;
    if (online) return;
    call(URI + 'getLook', {}, receive);
    wakeTimer = setTimeout(wake, 5000);
  }
  function onStatus(msg) {
    if (msg.serviceName !== 'dev.themepack.look.service') return;
    online = !!msg.connected;
    if (online) {
      if (sub) { try { sub.cancel(); } catch (e) { /* already closed */ } }
      sub = call(URI + 'getLook', { subscribe: true }, receive);
    } else if (!wakeTimer) {
      wake();
    }
  }
  if (window.PalmServiceBridge) {
    window.__themepackStatus = call('luna://com.palm.bus/signal/registerServerStatus',
      { serviceName: 'dev.themepack.look.service', subscribe: true }, onStatus);
  }

  window.__themepack = {
    current: function () { return latest; },
    onChange: function (fn) {
      listeners.push(fn);
      if (latest) fn(latest);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    setLook: function (look, done) {
      call(URI + 'setLook', look, function (msg) { if (done) done(msg); });
    }
  };

  // Report how long the page took to reach a mounted app, so the cost of skipping the V8 snapshot can be measured.
  function reportLoad() {
    var root = document.getElementById('root');
    if (root && root._reactRootContainer) {
      var ms = Math.round(Date.now() - window.performance.timing.navigationStart);
      call(URI + 'getLook', { loadMs: ms }, function () {});
      if (warm) setTimeout(function () { document.documentElement.style.visibility = ''; window.PalmSystem.hide(); }, 300);
      return;
    }
    setTimeout(reportLoad, 50);
  }

  // Ask WAM to keep the hidden app loaded.
  try {
    if (window.PalmSystem && typeof window.PalmSystem.keepAlive === 'function') window.PalmSystem.keepAlive(true);
  } catch (e) { /* not supported: the warm-up is lost, the app still works */ }

  if (window.PalmServiceBridge) reportLoad();
})();
