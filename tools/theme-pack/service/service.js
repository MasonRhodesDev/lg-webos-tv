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

// The calendar. A theme pack with group: 'seasonal' gives `season`, a list of windows; any other theme is 'custom'.
// A window is fixed, { from: 'MM-DD', to: 'MM-DD' } (both days included; it may cross New Year), or follows a day
// that moves:
//   { rule: 'easter' }                                    Western Easter Sunday
//   { rule: 'hanukkah' }                                  the eight days from 25 Kislev
//   { rule: 'weekday', month: 11, weekday: 4, nth: 4 }    the nth weekday of a month (0 is Sunday; nth -1 is the last)
// widened by `before` and `after` whole days (optional). A day here is a count of whole days since 1970 on the TV's
// local calendar, so a window is the same days in every time zone.
var DAY = 86400000;
function dayOf(y, m, d) { return Date.UTC(y, m - 1, d) / DAY; }
function today() { var n = new Date(); return dayOf(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
function iso(day) { return new Date(day * DAY).toISOString().slice(0, 10); }
function yearOf(day) { return new Date(day * DAY).getUTCFullYear(); }
// 1970-01-01 was a Thursday.
function weekdayOf(day) { return ((day + 4) % 7 + 7) % 7; }

// Easter Sunday in the Gregorian calendar (the anonymous Gregorian computus).
function easter(y) {
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var n = h + l - 7 * m + 114;
  return dayOf(y, Math.floor(n / 31), n % 31 + 1);
}
// The Hebrew calendar by arithmetic: the days from its epoch to the new moon of a year's first month, moved by the
// calendar's postponement rules. HEBREW_EPOCH is that epoch as a day since 1970.
var HEBREW_EPOCH = -2092590;
function hebrewElapsed(y) {
  var months = Math.floor((235 * y - 234) / 19), parts = 12084 + 13753 * months;
  var day = 29 * months + Math.floor(parts / 25920);
  return (3 * (day + 1)) % 7 < 3 ? day + 1 : day;
}
function hebrewNewYear(y) {
  var a = hebrewElapsed(y - 1), b = hebrewElapsed(y), c = hebrewElapsed(y + 1);
  return HEBREW_EPOCH + b + (c - b === 356 ? 2 : b - a === 382 ? 1 : 0);
}
// 25 Kislev, the first day of Hanukkah, in the Hebrew year that begins in the autumn of Gregorian year y. Kislev
// follows Tishrei (30 days) and Cheshvan (30 days in a year of 355 or 385 days, otherwise 29).
function hanukkah(y) {
  var start = hebrewNewYear(y + 3761), length = hebrewNewYear(y + 3762) - start;
  return start + 30 + (length % 10 === 5 ? 30 : 29) + 24;
}
function nthWeekday(y, month, weekday, nth) {
  if (nth > 0) { var first = dayOf(y, month, 1); return first + (weekday - weekdayOf(first) + 7) % 7 + 7 * (nth - 1); }
  var last = dayOf(y, month + 1, 0);
  return last - (weekdayOf(last) - weekday + 7) % 7;
}

function monthDay(s) {
  var m = /^(\d\d)-(\d\d)$/.exec(String(s)), days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!m) return null;
  var month = Number(m[1]), d = Number(m[2]);
  return month >= 1 && month <= 12 && d >= 1 && d <= days[month - 1] ? [month, d] : null;
}
function whole(n, min, max) { return typeof n === 'number' && n === Math.floor(n) && n >= min && n <= max; }
// A season entry as a function of the year: that year's window as [first day, last day]. null for an entry this
// service cannot read.
function windowOf(w) {
  if (!w || typeof w !== 'object') return null;
  if (w.rule === undefined) {
    var from = monthDay(w.from), to = monthDay(w.to);
    if (!from || !to || w.before !== undefined || w.after !== undefined) return null;
    var wraps = to[0] < from[0] || (to[0] === from[0] && to[1] < from[1]);
    return function (y) { return [dayOf(y, from[0], from[1]), dayOf(wraps ? y + 1 : y, to[0], to[1])]; };
  }
  var before = w.before === undefined ? 0 : w.before, after = w.after === undefined ? 0 : w.after, anchor = null;
  if (!whole(before, 0, 180) || !whole(after, 0, 180)) return null;
  if (w.rule === 'easter') anchor = function (y) { var e = easter(y); return [e, e]; };
  else if (w.rule === 'hanukkah') anchor = function (y) { var h = hanukkah(y); return [h, h + 7]; };
  else if (w.rule === 'weekday' && whole(w.month, 1, 12) && whole(w.weekday, 0, 6) && (whole(w.nth, 1, 4) || w.nth === -1)) {
    anchor = function (y) { var n = nthWeekday(y, w.month, w.weekday, w.nth); return [n, n]; };
  }
  if (!anchor) return null;
  return function (y) { var s = anchor(y); return [s[0] - before, s[1] + after]; };
}
// The window that holds a day, or the next one to come.
function occurrence(windowFn, day) {
  var y = yearOf(day);
  for (var i = y - 1; i <= y + 1; i++) { var s = windowFn(i); if (s[1] >= day) return s; }
  return windowFn(y + 2);
}

// The seasonal themes: id -> its windows. A pack that says 'seasonal' with no window this service can read is listed
// as a custom theme, so it can still be turned on by hand.
var seasons = {};
Object.keys(themes).forEach(function (id) {
  if (themes[id].group !== 'seasonal') return;
  var entries = themes[id].season instanceof Array ? themes[id].season : [];
  var read = entries.map(windowOf).filter(function (f) { return !!f; });
  if (read.length) seasons[id] = read;
  if (read.length < entries.length || !entries.length) {
    reports.push({ at: new Date().toISOString(), from: 'service', kind: read.length ? 'gap' : 'error',
                   text: 'theme ' + id + ': ' + (entries.length - read.length || 'no') + ' season window(s) unreadable' +
                         (read.length ? '' : '; listed as a custom theme') });
  }
});

// What can be chosen as themes, for a day: the custom themes, then the seasonal ones in calendar order (by the
// window that holds or first follows 1 January). A seasonal theme carries its pack's `season`, and what that means
// around this day: `dates`, each window's current or next run as { from, to } ('YYYY-MM-DD'), and `inSeason`.
function listing(day) {
  var newYear = dayOf(yearOf(day), 1, 1), custom = [], seasonal = [];
  Object.keys(themes).forEach(function (id) {
    var item = { id: id, name: themes[id].name, description: themes[id].description || '', group: seasons[id] ? 'seasonal' : 'custom' };
    if (!seasons[id]) { custom.push(item); return; }
    var runs = seasons[id].map(function (f) { return occurrence(f, day); }).sort(function (a, b) { return a[0] - b[0]; });
    item.season = themes[id].season;
    item.dates = runs.map(function (s) { return { from: iso(s[0]), to: iso(s[1]) }; });
    item.inSeason = runs.some(function (s) { return s[0] <= day; });
    seasonal.push({ item: item, at: Math.min.apply(null, seasons[id].map(function (f) { return occurrence(f, newYear)[0]; })) });
  });
  seasonal.sort(function (a, b) { return a.at - b.at || (a.item.id < b.item.id ? -1 : 1); });
  return custom.concat(seasonal.map(function (s) { return s.item; }));
}

// The seasonal themes the calendar turns on for a day: at most one season with one holiday over it. A window longer
// than SEASON_DAYS is a season, a shorter one a holiday. Of the seasons whose window holds the day the longest wins;
// of the holidays, the shortest (the more particular day). `skip` lists themes the household has left out.
var SEASON_DAYS = 45;
function calendar(day, skip) {
  var season = null, holiday = null;
  Object.keys(seasons).sort().forEach(function (id) {
    if (skip.indexOf(id) >= 0) return;
    seasons[id].forEach(function (f) {
      var s = occurrence(f, day), days = s[1] - s[0] + 1;
      if (s[0] > day) return;
      if (days > SEASON_DAYS) { if (!season || days > season.days) season = { id: id, days: days }; }
      else if (!holiday || days < holiday.days) holiday = { id: id, days: days };
    });
  });
  return (season ? [season.id] : []).concat(holiday && (!season || holiday.id !== season.id) ? [holiday.id] : []);
}

// The look as kept in data/look.json: the style, the active themes (inner first), `auto` (the calendar chooses the
// seasonal themes) and `skip` (seasonal themes the calendar leaves out).
function current() {
  var look = readJson(lookFile, {});
  var style = styles[look.style] ? look.style : defaultStyle;
  var active = (look.themes instanceof Array ? look.themes : []).filter(function (t) { return !!themes[t]; });
  var skip = (look.skip instanceof Array ? look.skip : []).filter(function (t) { return !!seasons[t]; });
  return { style: style, themes: active, auto: look.auto === true, skip: skip };
}
// With `auto` on the calendar owns the seasonal themes; the others stay as chosen, in their order, under them.
function follow(look, day) {
  if (look.auto) look.themes = look.themes.filter(function (t) { return !seasons[t]; }).concat(calendar(day, look.skip));
  return look;
}
// The day the look was last set against. newDay() moves it on: true when the look or the theme listing changed with it.
var day = today();
function newDay() {
  var now = today();
  if (now === day) return false;
  var listed = JSON.stringify(listing(day)), look = current(), was = look.themes.join(' ');
  day = now;
  var moved = follow(look, day).themes.join(' ') !== was;
  if (moved) fs.writeFileSync(lookFile, JSON.stringify(look));
  return moved || JSON.stringify(listing(day)) !== listed;
}
function payload() {
  var look = follow(current(), day);
  return {
    returnValue: true,
    look: look,
    subscribers: Object.keys(subscribers).length,
    settings: settings,
    probing: probing.on,
    // Theme assets are files next to the packs; renderers resolve a recipe's `asset` against this.
    assets: 'file://' + path.join(packsDir, 'assets') + '/',
    // The styles' font files; a style's font.files are relative to this.
    fonts: 'file://' + path.join(packsDir, 'fonts') + '/',
    style: styles[look.style],
    themes: look.themes.map(function (t) { return themes[t]; }),
    // The day the calendar was last read for, on the service's clock.
    today: iso(day),
    available: {
      styles: Object.keys(styles).map(function (k) { return { id: k, name: styles[k].name }; }),
      themes: listing(day)
    }
  };
}

service.register('getLook', function (message) {
  // A day that turned unseen (the timer below runs late across a suspend) is caught up with here.
  if (newDay()) notify();
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
  if (p.auto !== undefined) {
    if (typeof p.auto !== 'boolean') return message.respond({ returnValue: false, errorText: 'auto must be true or false' });
    look.auto = p.auto;
  }
  if (p.skip !== undefined) {
    if (!(p.skip instanceof Array)) return message.respond({ returnValue: false, errorText: 'skip must be a list' });
    var odd = p.skip.filter(function (t) { return !seasons[t]; });
    if (odd.length) return message.respond({ returnValue: false, errorText: 'not a seasonal theme: ' + odd.join(', ') });
    look.skip = p.skip;
  }
  newDay();
  fs.writeFileSync(lookFile, JSON.stringify(follow(look, day)));
  message.respond(notify());
}

// The calendar is read when the service starts and once a day, just after local midnight: one timer, set again each
// time it fires. It must not hold the process open by itself (the service stays up by its own activity).
(function () {
  var look = current(), was = look.themes.join(' ');
  if (follow(look, day).themes.join(' ') === was) return;
  try { fs.writeFileSync(lookFile, JSON.stringify(look)); } catch (e) {
    reports.push({ at: new Date().toISOString(), from: 'service', kind: 'error', text: 'look not saved: ' + String(e && e.message || e) });
  }
})();
function atMidnight() {
  var n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
  var timer = setTimeout(function () {
    try { if (newDay()) notify(); } catch (e) {
      reports.push({ at: new Date().toISOString(), from: 'service', kind: 'error', text: 'calendar: ' + String(e && e.message || e) });
    }
    atMidnight();
  }, Math.max(1000, next.getTime() - n.getTime()));
  if (timer.unref) timer.unref();
}
atMidnight();

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
// reads it to wait for a state and to check where focus is before it presses OK. Test instrumentation only: the layer
// sends probes only while `probing` is on, which the suite turns on for a run (setProbing). It is off at every start
// (never written to disk) and turns itself off when nobody has read the probes or refreshed it for a while.
var probes = {};
var probing = { on: false, ms: 0, timer: null };
var PROBING_MS = 10 * 60 * 1000, PROBING_MAX_MS = 60 * 60 * 1000;
function setProbing(on, ms) {
  if (probing.timer) clearTimeout(probing.timer);
  probing.timer = null;
  var was = probing.on;
  probing.on = !!on;
  if (probing.on) {
    probing.ms = Math.max(1, Math.min(PROBING_MAX_MS, ms || PROBING_MS));
    probing.timer = setTimeout(function () { setProbing(false); }, probing.ms);
    // The service stays up by its own activity; this timer must not hold a process open by itself.
    if (probing.timer.unref) probing.timer.unref();
  } else {
    probes = {};
  }
  if (was !== probing.on) notify();
}
service.register('setProbing', function (message) {
  var p = message.payload || {};
  if (typeof p.on !== 'boolean') return message.respond({ returnValue: false, errorText: 'on must be true or false' });
  setProbing(p.on, typeof p.seconds === 'number' ? p.seconds * 1000 : 0);
  message.respond({ returnValue: true, probing: probing.on, seconds: probing.on ? probing.ms / 1000 : 0 });
});
service.register('setProbe', function (message) {
  var p = message.payload || {};
  if (!probing.on) return message.respond({ returnValue: false, errorText: 'probing is off' });
  var prev = probes[String(p.from || '')];
  probes[String(p.from || '')] = { at: new Date().toISOString(), layer: String(p.layer || ''), seq: prev ? prev.seq + 1 : 1,
                                   state: p.state === undefined ? null : p.state };
  message.respond({ returnValue: true });
});
// `now` is the service's clock, so a reader can tell how old each probe is without trusting its own. A read keeps
// probing on for another while.
service.register('getProbe', function (message) {
  if (probing.on) setProbing(true, probing.ms);
  message.respond({ returnValue: true, now: new Date().toISOString(), probing: probing.on, probes: probes });
});
