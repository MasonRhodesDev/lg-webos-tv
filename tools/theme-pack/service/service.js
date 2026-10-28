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
// What the TV's renderers reported (loaded, errors), newest last. They cannot write files, so this is their log.
var reports = [];
// Whether our Settings is open, and at which page (a page id from settings/catalog.json, or '' for the top). `at`
// changes with every request, so the layer acts on requests rather than on state: a compositor restart must not
// reopen Settings nobody asked for.
var settings = { open: false, target: '', at: 0 };

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
    settings: settings,
    // Theme assets are files next to the packs; renderers resolve a recipe's `asset` against this.
    assets: 'file://' + path.join(packsDir, 'assets') + '/',
    // The styles' font files; a style's font.files are relative to this.
    fonts: 'file://' + path.join(packsDir, 'fonts') + '/',
    style: styles[look.style],
    themes: look.themes.map(function (t) { return themes[t]; }),
    available: {
      styles: Object.keys(styles).map(function (k) { return { id: k, name: styles[k].name }; }),
      themes: Object.keys(themes).map(function (k) { return { id: k, name: themes[k].name, description: themes[k].description || '' }; })
    }
  };
}

service.register('getLook', function (message) {
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
  message.respond(notify());
}

function notify() {
  var out = payload();
  Object.keys(subscribers).forEach(function (k) { subscribers[k].respond(out); });
  return out;
}

// The Settings stub (mounted over LG's Settings app) calls openSettings with the page LG's caller asked for; the
// layer calls closeSettings when our Settings closes.
service.register('openSettings', function (message) {
  var target = (message.payload || {}).target;
  if (target !== undefined && typeof target !== 'string') {
    return message.respond({ returnValue: false, errorText: 'target must be a page id' });
  }
  settings = { open: true, target: target || '', at: Date.now() };
  message.respond(notify());
});
service.register('closeSettings', function (message) {
  settings = { open: false, target: '', at: Date.now() };
  message.respond(notify());
});

// Whether tools/telemetry-off is in force this boot. Its boot hook (80-telemetry-off) bind-mounts a generated hosts
// file carrying MARKER over /etc/hosts, so the marker is there only while this boot's blackhole is live; the kit's
// off switch and an unfinished run say it is not. "active" needs the kit's directory visible too: a jail's /etc/hosts
// is a copy made once, so a marker alone may be stale. "active", "inactive" (the kit is there but not in force) or
// "unknown" (no kit visible, or nothing readable). The paths are the kit's (telemetry-off.sh); env vars move them.
var KIT_DIR = process.env.TELEMETRY_OFF_DIR || '/var/lib/telemetry-off';
var HOSTS = process.env.TELEMETRY_OFF_HOSTS || '/etc/hosts';
var MARKER = '# telemetry-off: LG telemetry blackhole';
function telemetryKit() {
  function has(f) { try { fs.statSync(f); return true; } catch (e) { return false; } }
  var hosts = null;
  try { hosts = fs.readFileSync(HOSTS, 'utf8'); } catch (e) { hosts = null; }
  var off = has(path.join(KIT_DIR, 'disabled')) || has(path.join(KIT_DIR, 'state', 'applying'));
  if (!has(KIT_DIR)) return 'unknown';
  return hosts !== null && hosts.indexOf(MARKER) >= 0 && !off ? 'active' : 'inactive';
}
service.register('getTelemetry', function (message) {
  message.respond({ returnValue: true, kit: telemetryKit() });
});

service.register('report', function (message) {
  var p = message.payload || {};
  reports.push({ at: new Date().toISOString(), from: String(p.from || ''), kind: String(p.kind || 'info'), text: String(p.text || '') });
  if (reports.length > 100) reports.shift();
  message.respond({ returnValue: true });
});

service.register('getReports', function (message) {
  message.respond({ returnValue: true, reports: reports });
});

// What each part of the layer shows right now (its `probe`, Layer.qml), latest only, by part file. The TV suite
// reads it to wait for a state and to check where focus is before it presses OK.
var probes = {};
service.register('setProbe', function (message) {
  var p = message.payload || {};
  probes[String(p.from || '')] = { at: new Date().toISOString(), state: p.state === undefined ? null : p.state };
  message.respond({ returnValue: true });
});
service.register('getProbe', function (message) {
  message.respond({ returnValue: true, probes: probes });
});
