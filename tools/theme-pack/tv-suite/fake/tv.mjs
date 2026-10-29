// A fake TV for dry runs: answers the ssh and scp commands the suite and the deploy scripts send, from a JSON state
// file ($TV_SUITE_FAKE). Our layer is modelled from the code the layer runs (menu.js and pages.js through
// lib/expect.mjs), so its probes have the real shape, rows and kinds; LG's side is a small stand-in. It records
// everything a real TV would have been made to do that the suite must never cause (`events`), and every command it
// did not recognise (`unknown`), so tests can assert on both. `faults` in the state make it misbehave on purpose.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Catalog as C, Menu as M, Pages as P, stubTarget, landing } from '../lib/expect.mjs';
import { hashIpk } from '../lib/package.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'tv', 'appinfo.json'), 'utf8'));
const STYLES = [{ id: 'smoke', name: 'Smoke' }, { id: 'bubble', name: 'Bubble' }];
const THEMES = [{ id: 'glow', name: 'Glow' }, { id: 'halloween', name: 'Halloween' }, { id: 'winter', name: 'Winter' }];
const SHOW_MS = 3000;
// The installed apps the back-refusing-app scenario may launch (launch points), standing in for a streaming app.
const APPS = ['com.webos.app.browser', 'org.webosbrew.hbchannel'];

export function initialState(over = {}) {
  return Object.assign({
    faults: {},
    volume: { volume: 12, muted: false, barUntil: 0, muteUntil: 0 },
    look: { style: 'smoke', themes: ['halloween'] },
    settings: { pictureMode: 'expert1', energySaving: 'auto', soundOutput: 'tv_speaker', soundMode: 'standard',
                deviceName: 'Living room', parentalControl: false, systemPin: '0000', quickStartMode: 'on',
                // As the TV answers range values: strings.
                contrast: '85', backlight: '80' },
    fg: 'com.webos.app.hdmi2', picker: { shown: false, focus: 1 }, toast: { message: '', until: 0 },
    quick: { open: false, stack: [], index: 0, dialog: false },
    menu: { open: false, stack: [], area: 'categories', cat: 0, index: 0, editing: null, pin: null, dialog: false },
    reports: [], ownLayerLog: '', themepackLog: '',
    installed: false, layerFiles: false, layer: false, stub: false, hook: false, mounted: false, lgQs: false,
    files: {}, events: [], writes: [], unknown: [], keys: [], launched: [], home: false, power: 'Active', bootAt: Date.now() - 3600e3, netinput: false, down: 0, oldHook: false, rootSettings: false, backup: null, probingUntil: 0, boots: 0, broken: null, settingsHost: false
  }, over);
}

// A TV after a good deploy: the package, the layer (and its reports), the hook and the stub mounted.
export function deployedState(over = {}) {
  const s = initialState({ installed: true, layerFiles: true, stub: true, hook: true });
  applyLayer(s, 'apply');
  s.mounted = s.layer;
  return Object.assign(s, over);
}

const load = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const save = (f, s) => fs.writeFileSync(f, JSON.stringify(s, null, 1));
const iso = () => new Date().toISOString();

// ---- our layer, as the probes see it ----

function store(s) {
  return {
    unlocked: !!s.menu.unlocked, values: {},
    state(ref) {
      const item = C.items[ref] || M.extra[ref];
      const d = (item && item.domain) || {};
      const id = item ? item.id : ref;
      const value = s.settings[id] !== undefined ? s.settings[id] : (d.values || [])[0];
      return { item, visible: true, active: true, label: String(value === undefined ? '' : value), value,
               options: (d.values || []).map((v) => ({ value: v, label: String(v), active: true })), min: d.min || 0, max: d.max || 1, step: 1 };
    },
    holds: () => true,
    item: (ref) => C.items[ref] || M.extra[ref]
  };
}
const LookArg = (s) => ({ available: { styles: STYLES, themes: THEMES }, chosen: s.look });
function rows(s, entry) {
  if (!entry) return [];
  try { return Array.from(P.model(entry, store(s), LookArg(s))); } catch (e) { return []; }
}
const focusable = (r) => !!r && r.section === undefined && r.variant !== 'info' && !r.disabled;
const topOf = (v) => v.stack[v.stack.length - 1];
function cats() { return Array.from(P.categories('picture')); }
function probeRow(r, i) {
  if (!r) return null;
  return { index: i, label: r.label || '', kind: r.kind || '', variant: r.variant || '', ref: r.ref || '',
           choice: r.choice === undefined ? '' : String(r.choice), category: r.category || '', locked: !!r.locked };
}
function probes(s) {
  const q = s.quick, m = s.menu, now = Date.now();
  const qr = q.open ? rows(s, topOf(q)) : [], mr = m.open && m.area === 'page' ? rows(s, topOf(m)) : [];
  const settings = {
    quick: { open: q.open, stack: q.stack.map((e) => e.id), dialog: !!q.dialog, focus: q.open ? probeRow(qr[q.index], q.index) : null },
    menu: { open: m.open, stack: m.stack.map((e) => e.id), area: m.area, category: m.stack.length ? P.categoryFor(m.stack[0].id) : 'picture',
            dialog: !!m.dialog, focus: m.area === 'categories' ? probeRow(cats()[m.cat], m.cat) : probeRow(mr[m.index], m.index),
            editing: m.editing ? { label: m.editing.label, length: m.editing.text.length, text: m.editing.text, row: m.editing.row, col: m.editing.col, keys: KEYBOARD } : null,
            pin: m.pin ? { mode: m.pin.mode, length: m.pin.pin.length, error: m.pin.error, pad: m.pin.pad } : null }
  };
  if (s.faults.noProbe) return {};
  // A healthy layer refreshes every probe; under the staleProbe fault they stopped a minute ago (a dead layer).
  const at = s.faults.staleProbe ? new Date(Date.now() - 60000).toISOString() : iso();
  return {
    'parts/Settings.qml': { at, state: settings },
    'parts/VolumeBar.qml': { at, state: { shown: now < s.volume.barUntil, level: s.volume.volume, muted: s.volume.muted } },
    'parts/VolumeMute.qml': { at, state: { shown: now < s.volume.muteUntil } },
    'parts/Toast.qml': { at, state: { shown: now < s.toast.until, message: now < s.toast.until ? s.toast.message : '' } },
    'parts/InputPicker.qml': { at, state: { shown: s.picker.shown, focus: s.picker.focus, tiles: 6 } }
  };
}

function landOn(s, v) {
  const r = rows(s, topOf(v));
  v.index = topOf(v).index !== undefined ? topOf(v).index : P.landing(topOf(v), r);
}
function event(s, what) { s.events.push(what); }
const KEYBOARD = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'Delete'], ['123', 'Space', 'Done']];
// A write through our UI: refused (and reported, as the store does) under the writeRefused fault.
function write(s, ref, apply) {
  if (s.faults.writeRefused) {
    s.reports.push({ at: iso(), from: 'ui', kind: 'warning', text: 'settings: ' + ref + ' not saved: Permission denied' });
    return;
  }
  apply();
  s.writes.push(ref);
}
const idOf = (ref) => (C.items[ref] ? C.items[ref].id : String(ref).split('/').pop());
function other(ref, cur) {
  const it = C.items[ref] || C.items[idOf(ref)], vals = (it && it.domain && it.domain.values) || ['on', 'off'];
  return cur === 'off' ? (vals.includes('on') ? 'on' : vals[0]) : 'off';
}

function openAt(s, target) {
  const m = s.menu, want = landing(target);
  s.quick.open = false;
  m.stack = want.stack.map((id) => ({ id }));
  m.area = want.area;
  m.cat = Math.max(0, cats().findIndex((c) => c.category === P.categoryFor(m.stack[0].id)));
  m.open = true; m.pin = null; m.editing = null; m.dialog = false;
  landOn(s, m);
  guardLocked(s);
}
function closeMenu(s) { Object.assign(s.menu, { open: false, pin: null, editing: null, dialog: false, unlocked: false }); }
function guardLocked(s) {
  const m = s.menu;
  if (m.open && m.stack.length && P.lockedPage(topOf(m).id, store(s)) && !m.pin) m.pin = { mode: 'page', pin: '', error: '', pad: 0 };
}
function push(s, v, entry) {
  topOf(v).index = v.index;
  v.stack.push(entry);
  landOn(s, v);
  if (v === s.menu) guardLocked(s);
}
function pop(s, v) {
  if (v.stack.length > 1) { v.stack.pop(); landOn(s, v); return; }
  if (v === s.menu) { v.area = 'categories'; return; }
  v.open = false;
}
function run(s, v, r) {
  if (!r) return;
  const which = v === s.menu ? 'menu' : 'quick';
  if (r.kind === 'page') push(s, v, { id: r.entry.id });
  else if (r.kind === 'settings') openAt(s, '');
  else if (r.kind === 'item' && r.variant === 'value') push(s, v, P.drill(r, ''));
  else if (r.kind === 'choose') { write(s, r.ref, () => { s.settings[idOf(r.ref)] = r.choice; }); pop(s, v); }
  else if (r.kind === 'item' && r.variant === 'toggle') { const id = idOf(r.ref); write(s, r.ref, () => { s.settings[id] = other(r.ref, s.settings[id]); }); }
  else if (r.kind === 'style') s.look = { style: r.choice, themes: s.look.themes };
  else if (r.kind === 'theme') { const t = s.look.themes.slice(), i = t.indexOf(r.choice); if (i >= 0) t.splice(i, 1); else t.push(r.choice); s.look = { style: s.look.style, themes: t }; }
  else if (r.kind === 'text') s.menu.editing = { label: r.label, ref: r.ref, text: String(s.settings[idOf(r.ref)] || ''), row: 0, col: 0 };
  else if (r.kind === 'changePin') s.menu.pin = { mode: 'new', pin: '', error: '', pad: 0 };
  else if (r.kind === 'action' && LEAVES[r.ref]) leave(s, LEAVES[r.ref]);
  else event(s, which + ': ran ' + (r.kind || '?') + ' ' + (r.ref || r.label));
}
function move(s, v, list, d) {
  for (let i = v.index + d; i >= 0 && i < list.length; i += d) if (focusable(list[i])) { v.index = i; return; }
}

// LG's apps our action rows open, with the appReturn LG's app launches when Back leaves it (catalog). As on the TV,
// our Settings stays open over them.
const LEAVES = { deviceConnector: ['com.webos.app.connectionwizard', 'network'], pictureTest: ['com.webos.app.customersupport', 'picture'],
                 soundTest: ['com.webos.app.customersupport', 'sound'] };
function leave(s, [app, ret]) { s.launched.push(app); s.lgApp = { app, ret, was: s.fg }; s.fg = app; }

// The quick sheet as LG's Quick Settings launch opens it (QuickSheet.openWith): a hotkey's activateType opens that
// row's picker.
function quickWith(s, params) {
  const q = s.quick, ref = params && params.activateType ? M.activateTypes[params.activateType] : '';
  closeMenu(s);
  q.open = true; q.stack = [{ id: 'quick' }]; landOn(s, q);
  if (!ref) return;
  const list = rows(s, q.stack[0]), i = list.findIndex((r) => r && r.ref === ref);
  if (i >= 0) { q.index = i; push(s, q, P.drill(list[i], '')); }
}

const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Delete'];
function key(s, k) {
  s.keys.push(k);
  const now = Date.now(), q = s.quick, m = s.menu;
  if (k === 'VOLUMEUP' || k === 'VOLUMEDOWN') {
    if (!s.faults.volumeStuck) s.volume.volume = Math.max(0, Math.min(100, s.volume.volume + (k === 'VOLUMEUP' ? 1 : -1)));
    s.volume.muted = false; s.volume.barUntil = now + SHOW_MS; return;
  }
  // As on the TV: LG's key filter takes Home and Exit. Home shows over everything and our menus stay open; Exit
  // over our menus does nothing.
  if (k === 'HOME') { s.home = true; return; }
  if (k === 'EXIT') { if (!q.open && !m.open) event(s, 'the app underneath got EXIT'); return; }
  if (k === 'MUTE') { s.volume.muted = !s.volume.muted; s.volume.muteUntil = s.volume.muted ? now + 60000 : 0; s.volume.barUntil = now + SHOW_MS; return; }
  if (k === 'QMENU') {
    if (s.faults.lgQuickSettings || !s.settingsHost) { s.lgQs = !s.lgQs; return; }
    if (q.open || m.open) { q.open = false; closeMenu(s); return; }
    q.open = true; q.stack = [{ id: 'quick' }]; landOn(s, q); return;
  }
  // LG's own Quick Settings (the fallback): it moves and opens its picker, and nothing in it is chosen here.
  if (s.lgQs) {
    if (k === 'ENTER') s.lgQsPicker = true;
    else if (k === 'BACK') { if (s.lgQsPicker) s.lgQsPicker = false; else s.lgQs = false; }
    else if (k !== 'UP' && k !== 'DOWN') event(s, "LG's Quick Settings got " + k);
    return;
  }
  const own = m.open ? m : q.open ? q : null;
  if (!own) {
    if (s.picker.shown) {
      if (k === 'LEFT' || k === 'RIGHT') s.picker.focus += k === 'RIGHT' ? 1 : -1;
      else if (k === 'BACK') s.picker.shown = false;
      else event(s, 'picker got ' + k + (k === 'ENTER' ? ': input switched' : ''));
      return;
    }
    if (k === 'BACK' && s.home) { s.home = false; return; }
    // Back in LG's app: it launches its appReturn, the Settings stub, and the input that was in front comes back.
    if (k === 'BACK' && s.lgApp && s.fg === s.lgApp.app) { const a = s.lgApp; s.lgApp = null; s.fg = a.was; launchSettings(s, { target: a.ret }); return; }
    event(s, 'the app underneath got ' + k);
    return;
  }
  if (own === m && m.editing) {
    const e = m.editing;
    if (k === 'BACK') { if (s.faults.backIsBackspace) { e.text = e.text.slice(0, -1); } else m.editing = null; }
    else if (k === 'UP' || k === 'DOWN') { e.row = Math.max(0, Math.min(3, e.row + (k === 'DOWN' ? 1 : -1))); e.col = Math.min(e.col, KEYBOARD[e.row].length - 1); }
    else if (k === 'LEFT' || k === 'RIGHT') e.col = Math.max(0, Math.min(KEYBOARD[e.row].length - 1, e.col + (k === 'RIGHT' ? 1 : -1)));
    else if (k === 'ENTER') {
      const key = KEYBOARD[e.row][e.col];
      if (key === 'Delete') e.text = e.text.slice(0, -1);
      else if (key === 'Done') { m.editing = null; write(s, e.ref, () => { s.settings[idOf(e.ref)] = e.text; }); }
      else if (key === 'Space') e.text += ' ';
      else if (key.length === 1) e.text += key;
    }
    return;
  }
  if (own === m && m.pin) {
    const p = m.pin;
    if (k === 'BACK') {
      if (s.faults.backIsBackspace) { p.pin = p.pin.slice(0, -1); return; }
      const wasPage = p.mode === 'page'; m.pin = null;
      if (wasPage) { while (m.stack.length > 1 && P.lockedPage(topOf(m).id, store(s))) m.stack.pop(); landOn(s, m); }
      return;
    }
    if (k === 'UP' && p.pad >= 3) p.pad -= 3;
    else if (k === 'DOWN' && p.pad < 9) p.pad += 3;
    else if (k === 'LEFT' && p.pad % 3) p.pad -= 1;
    else if (k === 'RIGHT' && p.pad % 3 < 2) p.pad += 1;
    else if (k === 'ENTER') {
      const d = PAD[p.pad];
      if (!/^\d$/.test(d)) return;
      p.pin += d; p.error = '';
      if (p.pin.length === 4) {
        if (p.pin === String(s.settings.systemPin)) { event(s, 'PIN accepted (' + p.mode + ')'); m.pin = null; m.unlocked = true; }
        else { p.pin = ''; p.error = 'Wrong PIN. Try again.'; }
      }
    }
    return;
  }
  if (own.dialog) { if (k === 'BACK') own.dialog = false; else event(s, 'dialog got ' + k); return; }
  if (own === m && m.area === 'categories') {
    const c = cats();
    if (k === 'UP' || k === 'DOWN') {
      const i = Math.max(0, Math.min(c.length - 1, m.cat + (k === 'DOWN' ? 1 : -1)));
      if (i !== m.cat) { m.cat = i; m.stack = [{ id: P.topOf(c[i].category) }]; landOn(s, m); }
    } else if (k === 'ENTER' || k === 'RIGHT') m.area = 'page';
    else if (k === 'BACK') closeMenu(s);
    return;
  }
  const list = rows(s, topOf(own)), r = list[own.index];
  // A UI bug on purpose: Back out of a picker chooses its focused row.
  if (k === 'BACK' && s.faults.backChooses && r && r.kind === 'choose') { run(s, own, r); return; }
  if (k === 'UP' || k === 'DOWN') move(s, own, list, k === 'DOWN' ? 1 : -1);
  else if (k === 'ENTER') run(s, own, r);
  else if (k === 'BACK') pop(s, own);
  else if (k === 'LEFT' || k === 'RIGHT') {
    if (r && r.variant === 'slider' && r.ref === 'volume') write(s, 'volume', () => { s.volume.volume = Math.max(0, Math.min(100, s.volume.volume + (k === 'RIGHT' ? 1 : -1))); });
    else if (r && r.variant === 'slider' && s.settings[idOf(r.ref)] !== undefined) {
      // Written back in the TV's type, as the store does (3efdb97); the typeBug fault writes a number instead.
      const id = idOf(r.ref), cur = s.settings[id], n = Number(cur) + (k === 'RIGHT' ? 1 : -1);
      write(s, r.ref, () => { s.settings[id] = typeof cur === 'string' && !s.faults.typeBug ? String(n) : n; });
    } else if (r && (r.variant === 'slider' || r.variant === 'stepper')) event(s, 'changed ' + r.ref + ' (' + k + ')');
    else if (own === m && k === 'LEFT') pop(s, own);
  }
}

// ---- LG's side ----

function layerUp(s) {
  s.settingsHost = false;
  if (!s.installed || s.faults.layerFails) return false;
  const at = iso();
  s.reports.push({ at, from: 'ui', kind: 'root', text: 'own layer root loaded' });
  if (s.broken === 'layer') {
    s.reports.push({ at, from: 'ui', kind: 'error', text: 'file:///media/developer/themepack/layer/ui/Look/Layer.qml: Syntax error' }, { at, from: 'ui', kind: 'error', text: 'layer could not be created' });
    return true;
  }
  s.reports.push({ at, from: 'ui', kind: 'ready', text: 'layer created' });
  if (s.broken === 'part') return true;
  s.settingsHost = true;
  if (s.faults.hookA) s.reports.push({ at, from: 'ui', kind: 'gap', text: "settings: host up, but Hook A is not applied; not reporting ready" });
  else s.reports.push({ at, from: 'ui', kind: 'ok', text: 'settings: the gear opens our quick sheet (system UI table)' }, { at, from: 'ui', kind: 'ready', text: 'settings: host ready' });
  return true;
}
function applyLayer(s, how) {
  s.ownLayerLog = '=== ' + iso() + ' ' + how + '\n';
  if (how === 'revert') { s.layer = false; s.ownLayerLog += 'stock\ndone\n'; return; }
  s.layer = layerUp(s);
  if (s.layer) s.layerInstance = (s.layerInstance || 1) + 1;
  s.ownLayerLog += (s.layer ? 'layer loaded after 7s' : 'layer root never reported; back to stock') + '\ndone\n';
}
function hook(s) {
  const log = ['=== ' + iso()];
  if (s.installed) log.push('service permissions set', 'bus rescanned'); else log.push('Look service not installed; skipping permissions');
  if (s.layerFiles) { applyLayer(s, 'apply'); log.push(s.layer ? 'UI layer started (see /tmp/own-layer.log)' : 'UI layer did not load (see /tmp/own-layer.log)'); }
  else log.push('compositor left stock (no layer installed)');
  const ready = s.layer && s.settingsHost && !s.faults.hookA;
  if (s.mounted) log.push('settings already mounted');
  else if (!s.stub) log.push('settings left stock (no stub installed)');
  else if (!s.layer || !s.installed) log.push('settings left stock (the stub needs our layer and the Look service)');
  else if (!ready) log.push('settings left stock (our Settings host never reported ready)');
  else { s.mounted = true; log.push('settings stub mounted'); }
  s.themepackLog += log.join('\n') + '\n';
}

function manifestOf(s) {
  const b = s.backup;
  return JSON.stringify({ created: b.created, lookData: !!b.lookData, hook: !!b.hook, ourHook: b.hook === 'ours', settings: !!b.settings, layer: !!b.layer, stub: !!b.stub, settingsMounted: b.settingsMounted, lookInstalled: b.lookInstalled });
}

// A reboot: everything the boot undoes goes (mounts, the layer, reports, /tmp), ssh is down for a few polls, then
// the boot hook runs.
function reboot(s) {
  s.boots++;
  Object.assign(s, { mounted: false, layer: false, settingsHost: false, netinput: false, probingUntil: 0, reports: [], themepackLog: '', ownLayerLog: '', files: {}, lgQs: false,
                     down: s.faults.slowBoot ? 6 : 2, bootAt: Date.now(), fg: 'com.webos.app.livetv' });
  s.quick.open = false; closeMenu(s); s.picker.shown = false;
  if (s.oldHook) { if (s.rootSettings) s.mounted = 'patched'; }
  else if (s.hook) hook(s);
}

function launchSettings(s, params) {
  if (!s.mounted) {
    // On purpose only in a fallback (the layer broken, the stub removed); anywhere else it is an event.
    if (!s.broken && s.stub) event(s, "LG's Settings opened");
    s.launched.push('com.palm.app.settings');
    s.lgSettingsWas = s.fg; s.fg = 'com.palm.app.settings';
    return;
  }
  const t = params && typeof params.target === 'string' ? params.target : undefined;
  const page = stubTarget(t);
  if (s.menu.open && JSON.stringify(s.menu.stack.map((e) => e.id)) === JSON.stringify(landing(page).stack)) return;
  openAt(s, page);
}

function luna(s, uri, p) {
  const m = uri.replace(/^luna:\/\//, '');
  const ok = (o) => Object.assign({ returnValue: true }, o);
  const look = 'dev.themepack.look.service/';
  if (m.startsWith(look) && !s.installed) return { returnValue: false, errorText: 'Service does not exist: dev.themepack.look.service.' };
  switch (m) {
    case look + 'getReports': return ok({ reports: s.reports });
    case look + 'setProbing':
      if (s.faults.oldService) return { returnValue: false, errorCode: -1, errorText: 'Unknown method "setProbing" for category "/"' };
      if (typeof p.on !== 'boolean') return { returnValue: false, errorText: 'on must be true or false' };
      if (s.faults.probingStuckOff) return ok({ probing: false });
      s.probingUntil = p.on ? Date.now() + (p.seconds || 600) * 1000 : 0;
      (s.probingCalls = s.probingCalls || []).push(p.on);
      return ok({ probing: p.on });
    case look + 'getProbe': {
      // As the service: nothing while probing is off (or expired); a read keeps it on.
      const on = Date.now() < s.probingUntil;
      if (!on) return ok({ now: iso(), probing: false, probes: {} });
      s.probingUntil = Math.max(s.probingUntil, Date.now() + 600000);
      const p = s.layer && s.broken !== 'layer' ? probes(s) : {};
      if (!s.settingsHost) delete p['parts/Settings.qml'];
      // One publication per read, from the current layer instance (a restart makes a new one).
      s.probeSeq = (s.probeSeq || 0) + 1;
      for (const k of Object.keys(p)) Object.assign(p[k], { layer: String(s.layerInstance || 1), seq: s.probeSeq });
      return ok({ now: iso(), probing: true, probes: p });
    }
    case 'com.webos.service.tvpower/power/getPowerState': return ok({ state: s.power || 'Active' });
    case look + 'getLook': return ok({ look: s.look, probing: Date.now() < s.probingUntil, available: { styles: STYLES, themes: THEMES } });
    case look + 'setLook':
      if (p.style !== undefined && !STYLES.some((x) => x.id === p.style)) return { returnValue: false, errorText: 'unknown style ' + p.style };
      s.look = { style: p.style !== undefined ? p.style : s.look.style, themes: p.themes !== undefined ? p.themes : s.look.themes };
      return ok({ look: s.look });
    case look + 'openSettings': if (s.settingsHost) openAt(s, p.target || ''); return ok({});
    case look + 'closeSettings': return ok({});
    case 'com.webos.audio/getVolume': return ok({ volume: s.volume.volume, muted: s.volume.muted, volumeMax: 100 });
    case 'com.webos.audio/setVolume': s.volume.volume = p.volume; return ok({});
    case 'com.webos.audio/setMute': s.volume.muted = !!p.mute; return ok({});
    case 'com.webos.settingsservice/getSystemSettings': {
      const out = {};
      const eula = { acrOnAllowed: false, acrAdAllowed: false, customAdAllowed: false, additionalDataAllowed: false, voiceAllowed: false,
                     voice2Allowed: false, takeOnAllowed: false, chpAllowed: false };
      for (const k of p.keys || []) if (k === 'eulaStatus') out[k] = eula; else if (s.settings[k] !== undefined && !(s.faults.unreadable || []).includes(k)) out[k] = s.settings[k];
      return ok({ category: p.category, settings: out });
    }
    case 'com.webos.settingsservice/setSystemSettings':
      for (const [k, v] of Object.entries(p.settings || {})) { if (!s.faults.restoreIgnored) s.settings[k] = v; (s.restores = s.restores || []).push(k); }
      return ok({});
    case 'com.webos.applicationManager/getForegroundAppInfo': return ok({ appId: s.fg });
    case 'com.webos.applicationManager/running': return ok({ running: [{ id: s.fg }].concat(s.faults.stubLingers && s.mounted ? [{ id: 'com.palm.app.settings' }] : []) });
    case 'com.webos.applicationManager/getAppInfo':
      if (p.id === APP.id) return s.installed ? ok({ appInfo: { id: APP.id, version: APP.version } }) : { returnValue: false, errorText: 'app not found' };
      if (p.id === 'com.palm.app.settings') return ok({ appInfo: s.mounted ? { id: p.id, version: '1.0.0', vendor: 'theme-pack' } : { id: p.id, version: '4.10.0', vendor: 'LGE', usePrerendering: true } });
      return { returnValue: false, errorText: 'app not found' };
    case 'com.webos.applicationManager/launch':
      if (p.id === 'com.palm.app.settings') launchSettings(s, p.params);
      else if (p.id === APP.id) { if (s.settingsHost) openAt(s, 'Look'); }
      // An input coming back to the front (a restore) is no event; any other launch is.
      else if (/^com\.webos\.app\.(hdmi\d|livetv)$/.test(p.id)) { s.fg = p.id; (s.inputLaunches = s.inputLaunches || []).push(p.id); }
      else if (APPS.includes(p.id)) { s.launched.push(p.id); s.fg = p.id; }
      else { s.fg = p.id; event(s, 'launched ' + p.id); }
      return ok({});
    case 'com.webos.applicationManager/closeByAppId':
      if (p.id === 'com.palm.app.settings' && s.fg === p.id) s.fg = s.lgSettingsWas || 'com.webos.app.livetv';
      return ok({});
    case 'com.webos.applicationManager/listLaunchPoints': return ok({ launchPoints: APPS.map((id) => ({ id })) });
    case 'com.webos.surfacemanager/getForegroundAppInfo':
      return ok({ foregroundAppInfo: [{ appId: s.fg, windowType: '_WEBOS_WINDOW_TYPE_CARD' }].concat(s.home ? [{ appId: 'com.webos.app.home', windowType: '_WEBOS_WINDOW_TYPE_HOME' }] : []) });
    // The TV's shape: a list, not one appId.
    case 'com.webos.service.systemUIManager/getForegroundAppInfo':
      if (s.faults.oddSystemUi) return ok({ foreground: 'quicksettings' });
      return ok({ foregroundAppInfo: (s.lgQs ? [{ appId: 'com.webos.app.quicksettings', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }] : [])
        .concat(s.picker.shown ? [{ appId: 'com.webos.app.quickinputpicker', windowType: '_WEBOS_WINDOW_TYPE_OVERLAY' }] : []) });
    case 'com.webos.service.networkinput/getPointerInputSocket':
      if (!s.faults.noKeySocket) s.netinput = true;
      return ok({ socketPath: '/tmp/netinput.pointer.sock' });
    case 'com.webos.service.systemUIManager/launch':
      if (p.appId === 'com.webos.app.quickinputpicker') { if (s.picker.shown) event(s, 'picker launched while open: input switched'); s.picker.shown = true; }
      if (p.appId === 'com.webos.app.quicksettings') { if (s.layer && s.settingsHost && !s.faults.lgQuickSettings) quickWith(s, p.params); else s.lgQs = true; }
      return ok({});
    // As on the TV: the input picker and Home stay open; LG's Quick Settings closes.
    case 'com.webos.service.systemUIManager/closeByAppId':
      if (p.id === 'com.webos.app.quicksettings') { s.lgQs = false; s.lgQsPicker = false; }
      return ok({});
    case 'com.webos.surfacemanager/showQuickSettings':
      if (s.layer && !s.faults.lgQuickSettings) { s.quick.open = true; s.quick.stack = [{ id: 'quick' }]; landOn(s, s.quick); } else s.lgQs = true;
      return ok({});
    case 'com.webos.surfacemanager/captureCompositorOutput': s.files[p.output] = surface(s); return ok({});
    case 'com.webos.notification/createToast':
      s.toast = { message: p.message, until: Date.now() + SHOW_MS };
      // An HDMI device turning the TV off through CEC in the middle of a scenario.
      if (s.faults.standbyOnToast) { s.power = 'ActiveStandby'; s.fg = ''; }
      return ok({});
    case 'com.webos.service.connectionmanager/getstatus': return ok({ wired: { state: 'connected' }, wifi: { state: 'disconnected' } });
    case 'com.webos.service.tv.display/getHDMIInfo': return ok({ width: 3840, height: 2160, frameRate: 120, scanType: true, HDMImode: true });
    case 'com.webos.service.tv.systemproperty/getSystemInfo': return ok({ modelName: 'OLED00X0', firmwareVersion: '00.00.00' });
    case 'com.palm.systemservice/osInfo/query': return ok({ core_os_release: '0.0.0' });
    case 'com.palm.systemservice/getPreferences': return ok({ useNetworkTime: true });
    case 'dev.themepack.look.service/getTelemetry': return ok({ kit: 'unknown' });
    case 'com.webos.service.wifi/getstatus': return ok({ status: 'serviceDisabled' });
    // As on the TV: btaudiosrc does not answer; bluetooth2 lists the devices (a speaker and the magic remote).
    case 'com.webos.service.bluetooth2/device/getStatus':
      return ok({ devices: s.btDevices || [
        { name: 'Speaker', address: '00:00:00:00:00:01', paired: true, connectedProfiles: ['a2dp'], typeOfDevice: 'bredr' },
        { name: 'Remote', address: '00:00:00:00:00:02', paired: true, connectedProfiles: ['hid'], typeOfDevice: 'ble' }] });
    case 'com.webos.appInstallService/dev/install':
      s.installed = true;
      s.packageHash = (s.ipks || {})[p.ipkUrl] || 'unknown';
      s.installs = (s.installs || 0) + 1;
      if (s.faults.installResetsLook) s.look = { style: 'smoke', themes: [] };
      return ok({ id: p.id, details: { state: 'installed' } });
    case 'com.webos.appInstallService/dev/remove': s.installed = false; return ok({});
  }
  s.unknown.push('luna ' + m);
  return { returnValue: false, errorText: 'fake TV: no ' + m };
}

// What the capture shows, coarsely: the colour of the topmost surface of ours.
function surface(s) {
  const p = probes(s)['parts/Settings.qml'];
  if (s.menu.open) return s.menu.pin ? 'pin' : s.menu.editing ? 'keyboard' : 'settings';
  if (s.quick.open) return 'sheet';
  if (s.picker.shown) return 'picker';
  if (Date.now() < s.toast.until) return 'toast';
  if (Date.now() < s.volume.barUntil) return 'volume';
  return p ? 'none' : 'none';
}
const COLOURS = { settings: [255, 79, 163], pin: [198, 255, 61], keyboard: [120, 200, 255], sheet: [80, 120, 255], picker: [60, 200, 120], toast: [250, 220, 60], volume: [240, 240, 240], none: [0, 0, 0] };
export function png(kind, w = 96, h = 54) {
  const [r, g, b] = COLOURS[kind] || COLOURS.none;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = y * (w * 3 + 1) + 1 + x * 3, inside = x > w / 8 && x < w * 7 / 8 && y > h / 8 && y < h * 7 / 8;
    raw[o] = inside ? r : 0; raw[o + 1] = inside ? g : 0; raw[o + 2] = inside ? b : 0;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- commands ----

const LUNA = /luna-send(?: -[nw] \d+| -i)* (luna:\/\/\S+) '((?:[^']|'\\'')*)'/g;
// Every luna-send in the command, in order; the answer is the last one's.
function lunaLine(s, cmd) {
  let last = null;
  for (const m of cmd.matchAll(LUNA)) {
    let p = {};
    try { p = JSON.parse(m[2].replace(/'\\''/g, "'")); } catch (e) { /* bad payload: answered as {} */ }
    last = JSON.stringify(luna(s, m[1], p));
  }
  return last;
}

function burst(s, cmd) {
  const m = cmd.match(/applicationManager\/launch '((?:[^']|'\\'')*)'/);
  const p = m ? JSON.parse(m[1].replace(/'\\''/g, "'")) : {};
  const out = [];
  const fg = s.fg;
  for (let i = 0; i < 8; i++) {
    if (i === 1) luna(s, 'luna://com.webos.applicationManager/launch', p);
    const t = i * 0.3;
    s.files['/tmp/tv-suite-burst/f' + i + '.png'] = surface(s);
    const running = s.mounted && (t < 0.3 || s.faults.stubLingers) ? 1 : 0;
    out.push(i + ' ' + (100 + t).toFixed(2) + ' 100.00 ' + (s.faults.stubInFront && t >= 1 ? 'com.palm.app.settings' : fg) + ' ' + running);
  }
  return out.join('\n') + '\n';
}

// One ssh call: returns { status, stdout }.
export function ssh(s, cmd, stdin) {
  const r = (stdout = '', status = 0) => ({ status, stdout });
  if (/^python - /.test(cmd)) {
    if (!/netinput\.pointer\.sock/.test(stdin)) return r('', 1);
    // LG's network input service makes its socket only when asked (getPointerInputSocket).
    if (!s.netinput) return { status: 1, stdout: 'no key socket at /tmp/netinput.pointer.sock ([Errno 2] No such file or directory): ask getPointerInputSocket first\n' };
    for (const k of cmd.split(/\s+/).slice(2)) key(s, k);
    return r('sent\n');
  }
  if (cmd.includes('tv-suite-burst')) return r(burst(s, cmd));
  if (cmd === '') return r(); // ssh -O exit: the control connection
  if (s.down > 0) { s.down--; return r('', 255); }
  if (cmd === 'date -u +%s; cut -d" " -f1 /proc/uptime') return r(Math.floor(Date.now() / 1000) + '\n' + ((Date.now() - s.bootAt) / 1000).toFixed(2) + '\n');
  if (/^\(sleep 1; reboot\)/.test(cmd)) { reboot(s); return r(); }
  if (cmd === 'tail -1 /tmp/themepack.log 2>/dev/null') return r(s.themepackLog.trim().split('\n').pop() + '\n');
  if (/^\/var\/lib\/webosbrew\/init\.d\/60-themepack; tail -8 \/tmp\/themepack\.log$/.test(cmd)) {
    if (s.oldHook) { if (s.rootSettings) s.mounted = 'patched'; s.themepackLog += 'old hook: patched settings mounted\n'; }
    else if (s.hook) hook(s);
    return r(s.themepackLog.trim().split('\n').slice(-8).join('\n') + '\n');
  }
  if (/^date -u /.test(cmd)) return r(iso().slice(0, 19) + '\n');
  if (cmd === 'true') return r();
  if (cmd.startsWith('# tv-suite: package hash')) return r(s.installed ? (s.packageHash || 'unknown') + '\n' : '', s.installed ? 0 : 1);
  if (cmd.startsWith('# tv-suite: keep service data')) return r('kept\n');
  if (cmd.startsWith('# tv-suite: restore service data')) { if (s.backup && s.backup.look) s.look = JSON.parse(JSON.stringify(s.backup.look)); return r('restored\n'); }
  if (cmd.startsWith('# tv-suite: backup')) {
    if (s.faults.backupFails) return r('', 1);
    let made = '';
    if (!s.backup) {
      s.backup = { created: iso(), hook: s.hook ? 'ours' : s.oldHook ? 'old' : null, settings: s.rootSettings, layer: s.layerFiles, stub: s.stub,
                   settingsMounted: !!s.mounted, lookInstalled: s.installed, lookData: s.installed, look: s.installed ? JSON.parse(JSON.stringify(s.look)) : null };
      made = 'backup made\n';
    } else made = 'backup kept from before\n';
    return r(made + manifestOf(s) + '\n');
  }
  if (cmd === 'cat /media/developer/themepack-backup/manifest.json') return s.backup ? r(manifestOf(s) + '\n') : r('', 1);
  if (cmd.startsWith('# tv-suite: restore backup')) {
    const b = s.backup;
    Object.assign(s, { hook: b.hook === 'ours', oldHook: b.hook === 'old', rootSettings: b.settings, layerFiles: b.layer, stub: b.stub });
    return r('restored\n');
  }
  if (cmd.startsWith('# tv-suite: verify backup')) {
    const b = s.backup, out = [];
    if ((b.hook === 'old') !== s.oldHook || (b.hook === 'ours') !== s.hook) out.push('hook differs');
    if (b.settings !== s.rootSettings) out.push('settings differ');
    return r(out.concat(['checked']).join('\n') + '\n');
  }
  if (cmd === '[ -S /tmp/netinput.pointer.sock ]') return r('', s.netinput ? 0 : 1);
  if (cmd === 'wc -l < /var/log/messages 2>/dev/null') return r('120\n');
  if (/^tail -n \+\d+ \/var\/log\/messages \| grep/.test(cmd)) return r(s.faults.lookAppDenied ? 'Oct 28 ls-hubd: Permission denied for dev.themepack.look to call dev.themepack.look.service/openSettings\n' : '', s.faults.lookAppDenied ? 0 : 1);
  if (cmd === 'mount') return r('/dev/root on / type squashfs (ro)\n' + (s.mounted ? '/dev/mmcblk0p1 on /usr/palm/applications/com.palm.app.settings type ext4 (rw)\n' : ''));
  if (/^rm -f \/tmp\/tv-suite-capture\.png$/.test(cmd)) { delete s.files['/tmp/tv-suite-capture.png']; return r(); }
  if (/^mkdir \/tmp\/own-layer\.lock/.test(cmd)) return r();
  if (/^\[ ! -d \/tmp\/own-layer\.lock \]$/.test(cmd)) return r();
  if (/^\(sh \S+\/own-layer\.sh (apply|revert);/.test(cmd)) { applyLayer(s, cmd.match(/own-layer\.sh (\w+)/)[1]); return r(); }
  if (/^sed -n .* \/tmp\/own-layer\.log$/.test(cmd)) return r(s.ownLayerLog);
  if (/^rm -rf \S+\/layer\.new && mkdir -p/.test(cmd)) return r();
  if (/^tar -C \S+\/layer\.new -mxf -$/.test(cmd)) {
    s.broken = stdin.includes('tv-suite: broken on purpose (layer)') ? 'layer' : stdin.includes('tv-suite: broken on purpose (no Settings part)') ? 'part' : null;
    return r();
  }
  if (/^rm -rf \S+\/layer && mv \S+\/layer\.new \S+\/layer$/.test(cmd)) { s.layerFiles = true; return r(); }
  if (/^tar -C \S+\/settings-stub\.new -mxf - && /.test(cmd)) { s.stub = true; return r(); }
  if (/^rm -rf \S+\/settings \S+\/settings-stub\.new && mkdir -p/.test(cmd)) { s.rootSettings = false; return r(); }
  if (cmd === 'sh -s') {
    if (/umount/.test(stdin)) { if (s.faults.stubBusy && s.mounted) return { status: 1, stdout: 'Settings is still in use; left mounted\n' }; s.mounted = false; }
    return r();
  }
  if (/^chmod 755 \S+60-themepack && \S+60-themepack; tail -8 \/tmp\/themepack\.log$/.test(cmd)) {
    if (!s.hook) return r('', 127);
    hook(s);
    return r(s.themepackLog.trim().split('\n').slice(-8).join('\n') + '\n');
  }
  if (/^rm -f \S+60-themepack$/.test(cmd)) { s.hook = false; return r(); }
  if (/^rm -rf \S+\/settings \S+\/settings-stub; echo removed$/.test(cmd)) { s.stub = false; return r('removed\n'); }
  if (/^s=\/media\/developer\/apps\/usr\/palm\/services\/\S+\/permissions\.sh; if/.test(cmd))
    return r(s.installed ? 'compositor groups: dev.themepack.look.service.group settings.read settings.write audio\n' : '');
  if (/appInstallService\/dev\/install/.test(cmd)) {
    if (s.faults.installFails) return r('{"returnValue":true,"details":{"state":"install failed","reason":"fake"},"statusValue":"failed"}\n');
    lunaLine(s, cmd);
    return r('{"returnValue":true,"id":"' + APP.id + '","details":{"state":"installed"}}\n');
  }
  if (/^cat \/var\/luna-service2-dev\/client-permissions\.d\//.test(cmd))
    return s.installed ? r('{"com.webos.surfacemanager.systemui":["dev.themepack.look.service.group","settings.read","audio"]}') : r('', 1);
  const l = lunaLine(s, cmd);
  if (l !== null) return r(l + '\n');
  s.unknown.push('ssh ' + cmd.slice(0, 200));
  return r('', 0);
}

// scp -q [opts] SRC DST, one side remote (host:path).
export function scp(s, args) {
  const files = args.filter((a, i) => !a.startsWith('-') && !(args[i - 1] === '-o'));
  const [src, dst] = files.slice(-2);
  const remote = (x) => /^[^/]*@[^:]+:/.test(x) || /^[\w.-]+:\//.test(x);
  if (remote(dst)) {
    const p = dst.slice(dst.indexOf(':') + 1);
    if (/60-themepack$/.test(p)) { s.hook = true; s.oldHook = false; }
    // An uploaded package: the fake keeps the hash of what it holds, as installed files would have it.
    if (/\.ipk$/.test(p)) { (s.ipks = s.ipks || {})[p] = hashIpk(src); }
    s.files[p] = 'uploaded';
    return 0;
  }
  if (remote(src)) {
    const p = src.slice(src.indexOf(':') + 1);
    if (!(p in s.files)) return 1;
    fs.writeFileSync(dst, png(s.files[p]));
    return 0;
  }
  return 1;
}

// ssh's arguments: options, the host, then the command.
function command(argv) {
  const args = argv.slice();
  while (args.length && args[0].startsWith('-')) { const o = args.shift(); if (['-o', '-i', '-p', '-l', '-O'].includes(o)) args.shift(); }
  args.shift();
  return args.join(' ');
}

// Entry points for fake/ssh and fake/scp (state in the $TV_SUITE_FAKE file).
export function main(kind, argv, stdin) {
  const f = process.env.TV_SUITE_FAKE;
  if (!f) { process.stderr.write('fake ' + kind + ': set TV_SUITE_FAKE to the fake TV state file\n'); return 255; }
  const s = load(f);
  let status;
  if (kind === 'scp') status = scp(s, argv);
  else {
    const r = ssh(s, command(argv), stdin);
    process.stdout.write(r.stdout);
    status = r.status;
  }
  save(f, s);
  return status;
}

// The same fake in this process, on the state file (so it agrees with the repo scripts run through the PATH shims).
export function fileBacked(f) {
  return async (cmd, argv, opts = {}) => {
    const s = load(f);
    if (s.faults.slow) await new Promise((r) => setTimeout(r, s.faults.slow));
    try { return await inProcess(s)(cmd, argv, opts); } finally { save(f, s); }
  };
}

// The same fake in this process, on a state object: an `exec` for lib/tv.mjs, so a test runs fast.
export function inProcess(s) {
  return async (cmd, argv, { input } = {}) => {
    if (cmd === 'scp') return { status: scp(s, argv), stdout: '', stderr: '' };
    if (cmd !== 'ssh') throw new Error('fake TV: no ' + cmd);
    const r = ssh(s, command(argv), input === undefined ? '' : String(input));
    return { status: r.status, stdout: r.stdout, stderr: '' };
  };
}
