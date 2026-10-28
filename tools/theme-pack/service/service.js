// Look service: holds the active style and themes and tells subscribers when they change.
// Runs on the TV's Node 0.12, so this file is ES5 only.
var Service = require('webos-service');
var fs = require('fs');
var path = require('path');

var ID = 'dev.themepack.look.service';
var service = new Service(ID);
var packsDir = path.join(__dirname, 'packs');
// The service runs sandboxed as a non-root user; data/ is the one directory the package makes writable for it.
var lookFile = path.join(__dirname, 'data', 'look.json');
var subscribers = {};
var lastLoadMs = null;

// Stay running after the first call: a cold start drops the call that woke the service.
service.activityManager.create('keepAlive', function () {});

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function packs(kind) {
  var dir = path.join(packsDir, kind), out = {};
  fs.readdirSync(dir).forEach(function (f) {
    if (/\.json$/.test(f)) { var p = readJson(path.join(dir, f), null); if (p && p.id) out[p.id] = p; }
  });
  return out;
}
var styles = packs('styles'), themes = packs('themes');
var defaultStyle = styles.smoke ? 'smoke' : Object.keys(styles)[0];

function current() {
  var look = readJson(lookFile, {});
  var style = styles[look.style] ? look.style : defaultStyle;
  var active = (look.themes || []).filter(function (t) { return !!themes[t]; });
  return { style: style, themes: active };
}
function payload() {
  var look = current();
  return {
    returnValue: true,
    look: look,
    subscribers: Object.keys(subscribers).length,
    lastLoadMs: lastLoadMs,
    style: styles[look.style],
    themes: look.themes.map(function (t) { return themes[t]; }),
    available: {
      styles: Object.keys(styles).map(function (k) { return { id: k, name: styles[k].name }; }),
      themes: Object.keys(themes).map(function (k) { return { id: k, name: themes[k].name, description: themes[k].description || '' }; })
    }
  };
}

service.register('getLook', function (message) {
  var t = message.payload && message.payload.loadMs;
  if (typeof t === 'number') lastLoadMs = t;
  if (message.isSubscription) subscribers[message.uniqueToken] = message;
  message.respond(payload());
}, function (message) {
  delete subscribers[message.uniqueToken];
});

service.register('setLook', function (message) {
  try { setLook(message); } catch (e) { message.respond({ returnValue: false, errorText: String(e && e.message || e) }); }
});

function setLook(message) {
  var p = message.payload || {}, look = current();
  if (p.style !== undefined) {
    if (!styles[p.style]) return message.respond({ returnValue: false, errorText: 'unknown style ' + p.style });
    look.style = p.style;
  }
  if (p.themes !== undefined) {
    if (!(p.themes instanceof Array)) return message.respond({ returnValue: false, errorText: 'themes must be a list' });
    var bad = p.themes.filter(function (t) { return !themes[t]; });
    if (bad.length) return message.respond({ returnValue: false, errorText: 'unknown theme ' + bad.join(', ') });
    look.themes = p.themes;
  }
  fs.writeFileSync(lookFile, JSON.stringify(look));
  var out = payload();
  Object.keys(subscribers).forEach(function (k) { subscribers[k].respond(out); });
  message.respond(out);
}
