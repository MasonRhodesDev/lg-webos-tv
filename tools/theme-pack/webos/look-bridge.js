// Look bridge for the stock Settings app: subscribes to the Look service and sets the CSS variables the
// patched main.css reads. If the service never answers, the variables keep their stock values.
(function () {
  'use strict';
  var URI = 'luna://dev.themepack.look.service/';
  var VARS = { focus: '--tp-focus', 'focus-ink': '--tp-focus-ink' };
  var listeners = [];
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

  if (window.PalmServiceBridge) subscribe(0);
})();
