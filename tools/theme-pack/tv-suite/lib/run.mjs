// Runs the scenarios: each one checks its preconditions, presses keys only through the guard (keys.mjs), waits by
// polling the TV's state (the parts' probes, luna gets), captures, asserts, and cleans up. Before the first scenario
// the suite takes a baseline of everything it could touch and journals it (journal.mjs); after every scenario it puts
// the TV back to that baseline and reads every value again to verify it.
import fs from 'node:fs';
import path from 'node:path';
import { guard } from './keys.mjs';
import { settingKey } from './expect.mjs';
import * as journal from './journal.mjs';

const SVC = 'luna://dev.themepack.look.service';
const SS = 'luna://com.webos.settingsservice';
const QS = 'com.webos.app.quicksettings', PICKER = 'com.webos.app.quickinputpicker';

// What a scenario must leave as it found it. The volume, the Look and the write scenarios' settings are changed on
// purpose, and put back by the scenario; anything still different afterwards fails it and is restored here.
export const WATCHED = ['pictureMode', 'energySaving', 'soundOutput', 'soundMode', 'deviceName', 'parentalControl', 'quickStartMode'];

// How old our Settings' probe may be (seconds by the service's clock): the layer sends it again every second while
// a menu of ours is open and every five seconds otherwise (Layer.qml).
export const FRESH = { open: 3, closed: 12 };

// The system UI app in front, from systemUIManager's foregroundAppInfo list: LG's Quick Settings, the input picker,
// '' for none, or 'unknown' for any other overlay, another shape or no answer (the guard then presses nothing).
export async function systemUiFront(tv) {
  let a;
  try { a = await tv.luna('luna://com.webos.service.systemUIManager/getForegroundAppInfo', {}); } catch (e) { return 'unknown'; }
  const list = a && a.foregroundAppInfo;
  if (!Array.isArray(list) || list.some((x) => !x || typeof x.appId !== 'string')) return 'unknown';
  const ids = list.map((x) => x.appId);
  if (ids.some((id) => id !== QS && id !== PICKER)) return 'unknown';
  return ids.includes(QS) ? QS : ids.includes(PICKER) ? PICKER : '';
}

export class Refused extends Error {}
export class Skip extends Error {}

export function makeCtx({ tv, out, say = console.log, poll = 250, sleep }) {
  const results = [];
  const ctx = {
    tv, out, say, poll,
    sleep: sleep || ((ms) => new Promise((r) => setTimeout(r, ms))),
    results,
    scenario: null,
    notes: {},
    // The PIN as read at the baseline: compared in memory, never written anywhere.
    secrets: {},
    journal: null,
    keyAt: '',
    aborted: false,
    note(k, v) { ctx.notes[k] = v; },
    check(name, ok, detail = '') {
      const r = { scenario: ctx.scenario && ctx.scenario.id, name, ok: !!ok, detail: String(detail) };
      results.push(r);
      say('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name + (detail ? ': ' + detail : ''));
      if (ctx.current) ctx.current.checks.push(r);
      return !!ok;
    },
    // Fails the scenario now.
    must(name, ok, detail) { if (!ctx.check(name, ok, detail)) throw new Error(name + (detail ? ': ' + detail : '')); },
    skip(why) { throw new Skip(why); },
    async luna(uri, payload, opts) { return tv.luna(uri, payload, opts); },
    // What the TV shows, and whether that can be trusted: `fresh` needs our Settings' probe recent by the service's
    // clock, and newer than the last key pressed.
    async state() {
      const r = await tv.probeRead();
      const p = r.states, m = r.meta.Settings;
      const systemUi = await systemUiFront(tv);
      const st = p.Settings || null;
      const open = !!(st && ((st.menu && st.menu.open) || (st.quick && st.quick.open)));
      let stale = '';
      if (!r.probing) stale = 'probing is off on the TV, so nothing can be seen (each command turns it on first)';
      else if (!st || !m) stale = 'no probe from our Settings: the layer is not up';
      else if (!(m.age <= (open ? FRESH.open : FRESH.closed))) stale = "our Settings' probe is " + (isFinite(m.age) ? m.age.toFixed(1) + ' s' : 'of unknown age') + ' old: the layer may be gone';
      else if (ctx.keyAt && !(m.at > ctx.keyAt)) stale = 'no probe since the last key';
      return { settings: st, picker: p.InputPicker || null, toast: p.Toast || null, volume: p.VolumeBar || null,
               mute: p.VolumeMute || null, systemUi, fresh: !stale, stale, now: r.now };
    },
    async settings() { return ((await tv.probes()).Settings) || { quick: {}, menu: {} }; },
    // Polls `fn` until it returns something truthy; fails with what it last saw.
    async wait(what, fn, { timeout = 8000 } = {}) {
      const end = Date.now() + timeout;
      let last;
      for (;;) {
        try { last = await fn(); } catch (e) { last = e.message; }
        if (last && last !== true && typeof last !== 'string') return last;
        if (last === true) return true;
        if (Date.now() > end) throw new Error('timed out waiting for ' + what + (last ? ' (last: ' + JSON.stringify(last).slice(0, 300) + ')' : ''));
        await ctx.sleep(ctx.poll);
      }
    },
    // Every key: a fresh state first (waiting a few seconds for one), then the guard, then the press.
    async key(name, allow = {}) {
      if (ctx.aborted) throw new Refused('interrupted');
      let st;
      const end = Date.now() + 4000;
      for (;;) {
        st = await ctx.state();
        if (st.fresh || Date.now() > end) break;
        await ctx.sleep(ctx.poll);
      }
      const why = guard(name, st, allow);
      if (why) { ctx.check('key ' + name + ' allowed', false, why); throw new Refused(why); }
      ctx.current && ctx.current.keys.push(name);
      ctx.keyAt = st.now;
      await tv.keys([name]);
    },
    async capture(name, { board, scene, state: shotState } = {}) {
      const dir = path.join(ctx.out, ctx.scenario.id);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, String(ctx.current.captures.length + 1).padStart(2, '0') + '-' + name + '.png');
      let look = null;
      try { look = (await tv.luna(SVC + '/getLook', {})).look; } catch (e) { /* recorded without */ }
      try { await tv.capture(file); } catch (e) { ctx.check('capture ' + name, false, e.message); return null; }
      ctx.current.captures.push({ name, file: path.relative(ctx.out, file), board: board || null, scene: scene || null, state: shotState || null, look });
      return file;
    },
    // A file the TV already wrote (a burst frame), saved as a capture.
    async capturePulled(name, remote, extra = {}) {
      const dir = path.join(ctx.out, ctx.scenario.id);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, String(ctx.current.captures.length + 1).padStart(2, '0') + '-' + name + '.png');
      try { await tv.pull(remote, file); } catch (e) { ctx.check('frame ' + name, false, e.message); return null; }
      ctx.current.captures.push(Object.assign({ name, file: path.relative(ctx.out, file), board: null, scene: null, look: null }, extra));
      return file;
    },
    async look() { return (await tv.luna(SVC + '/getLook', {})).look; },
    async setLook(look) { return tv.luna(SVC + '/setLook', { style: look.style, themes: look.themes }); },
    async foreground() { return (await tv.luna('luna://com.webos.applicationManager/getForegroundAppInfo', {})).appId || ''; },
    async volume() {
      const v = await tv.luna('luna://com.webos.audio/getVolume', {});
      return { volume: v.volume, muted: !!v.muted };
    },
    async setting(id) {
      const k = settingKey(id);
      const a = await tv.luna(SS + '/getSystemSettings', { category: k.category, keys: [k.key] });
      return a.settings ? a.settings[k.key] : undefined;
    }
  };
  return ctx;
}

// Everything a scenario must not change, read from the TV: { values, pin }. A value that cannot be read is
// { unreadable: why }, which never equals anything. The PIN is returned for in-memory comparison only.
const unreadable = (e) => ({ unreadable: String(e && e.message || e) });
export async function snapshot(ctx) {
  const v = {};
  const read = async (k, fn) => { try { const x = await fn(); v[k] = x === undefined ? unreadable('no value') : x; } catch (e) { v[k] = unreadable(e); } };
  await read('look', () => ctx.look());
  await read('volume', () => ctx.volume());
  await read('foreground', () => ctx.foreground());
  for (const id of WATCHED) await read(id, () => ctx.setting(id));
  await read('network', async () => {
    const c = await ctx.tv.luna('luna://com.webos.service.connectionmanager/getstatus', {});
    if (c.returnValue === false) throw new Error(c.errorText || 'refused');
    return { wired: c.wired && c.wired.state, wifi: c.wifi && c.wifi.state, ssid: c.wifi && c.wifi.ssid };
  });
  await read('bluetooth', async () => {
    const b = await ctx.tv.luna('luna://com.webos.service.btaudiosrc/getPairedDevices', {});
    if (!Array.isArray(b.devices)) throw new Error(b.errorText || 'no devices list');
    return b.devices.map((d) => String(d.address) + ' ' + String(d.name)).sort();
  });
  let pin;
  try { const a = await ctx.tv.luna(SS + '/getSystemSettings', { category: 'lock', keys: ['systemPin'] }); pin = a.settings ? a.settings.systemPin : undefined; } catch (e) { pin = undefined; }
  return { values: v, pin };
}
export const same = (a, b) => !(a && a.unreadable) && !(b && b.unreadable) && JSON.stringify(a) === JSON.stringify(b);
const shown = (x) => (x && x.unreadable ? 'unreadable (' + x.unreadable + ')' : JSON.stringify(x));

// Puts the TV back to `baseline` (a snapshot's values) and reads everything again: { acted, left }. `left` is what is
// still not verified as the baseline after the restore, by that second read.
export async function restoreVerified(ctx, baseline, pin) {
  // The manual pass's Back steps run on the input the person chose; the person restores the baseline's afterwards.
  if (ctx.foregroundOverride) baseline = Object.assign({}, baseline, { foreground: ctx.foregroundOverride });
  const cur = (await snapshot(ctx)).values, acted = [];
  for (const k of Object.keys(baseline)) {
    if (same(baseline[k], cur[k]) || (baseline[k] && baseline[k].unreadable)) continue;
    const was = baseline[k];
    try {
      if (k === 'look') { await ctx.setLook(was); acted.push(k); }
      else if (k === 'volume') {
        await ctx.luna('luna://com.webos.audio/setVolume', { volume: was.volume });
        if (!cur.volume || cur.volume.muted !== was.muted) await ctx.luna('luna://com.webos.audio/setMute', { mute: was.muted });
        acted.push(k);
      } else if (k === 'foreground' && was) {
        // Back to the input or app that was in front: a launch of the same app id, restoring, not switching.
        await ctx.luna('luna://com.webos.applicationManager/launch', { id: was });
        await ctx.sleep(2000);
        acted.push(k);
      } else if (WATCHED.includes(k)) {
        const sk = settingKey(k);
        await ctx.luna(SS + '/setSystemSettings', { category: sk.category, settings: { [sk.key]: was } });
        acted.push(k);
      }
    } catch (e) { acted.push(k + ' (failed: ' + e.message + ')'); }
  }
  const after = await snapshot(ctx);
  const left = Object.keys(baseline).filter((k) => !same(baseline[k], after.values[k]))
    .map((k) => k + ': was ' + shown(baseline[k]) + ', now ' + shown(after.values[k]));
  if (pin !== undefined && String(after.pin) !== String(pin)) left.push(after.pin === undefined ? 'the PIN could not be read back' : 'the PIN changed (the suite never writes it)');
  return { acted, left };
}

// Closes whatever of ours is open with Back, through the guard (so never on a stale probe or over LG's UI), and
// LG's Quick Settings and input picker with closeByAppId. Returns why something could not be closed, or ''.
export async function closeAll(ctx) {
  let why = '';
  for (let i = 0; i < 12; i++) {
    const s = await ctx.settings();
    if (!(s.menu && s.menu.open) && !(s.quick && s.quick.open)) break;
    try { await ctx.key('BACK'); } catch (e) { why = 'our menu could not be closed: ' + e.message; break; }
    await ctx.sleep(ctx.poll);
  }
  const st = await ctx.state();
  if (st.systemUi === QS) await ctx.luna('luna://com.webos.service.systemUIManager/closeByAppId', { id: QS });
  if ((st.picker && st.picker.shown) || st.systemUi === PICKER) await ctx.luna('luna://com.webos.service.systemUIManager/closeByAppId', { id: PICKER });
  return why;
}

// Turns the service's probing on and waits for our Settings' probe: nothing is pressed or judged without it.
export async function probingUp(ctx, timeout = 10000) {
  try { await ctx.tv.setProbing(true); } catch (e) { throw new Error('the Look service cannot turn probing on (' + e.message + '): deploy this branch first'); }
  const end = Date.now() + timeout;
  for (;;) {
    let r = null;
    try { r = await ctx.tv.probeRead(); } catch (e) { r = null; }
    if (r && r.probing && r.states.Settings && r.meta.Settings.age <= FRESH.open) return;
    if (Date.now() > end) {
      if (!r || !r.probing) throw new Error('probing did not come up on the TV: nothing can be seen, so nothing is pressed');
      if (r.states.Settings) throw new Error("probing is on, but our Settings' probe is " + r.meta.Settings.age.toFixed(0) + ' s old: the layer is not refreshing it');
      throw new Error('probing is on, but the layer sends no probe for our Settings: deploy this branch first (tv-suite.mjs deploy)');
    }
    await ctx.sleep(Math.max(ctx.poll, 200));
  }
}

// Takes the baseline and opens the journal, unless one is already open (a nested call: coldboot's and manual's).
export async function baseline(ctx) {
  if (ctx.journal) return false;
  const b = await snapshot(ctx);
  const bad = Object.keys(b.values).filter((k) => b.values[k] && b.values[k].unreadable);
  if (bad.length) throw new Error('no baseline: ' + bad.map((k) => k + ' is ' + shown(b.values[k])).join('; ') + '. Nothing is changed without one.');
  ctx.journal = journal.open(ctx.tv.host, ctx.out, b.values);
  ctx.secrets.pin = b.pin;
  return true;
}

// Restores to the journal's baseline and closes the journal once that is verified.
export async function finish(ctx, owned) {
  const r = await restoreVerified(ctx, ctx.journal.baseline, ctx.secrets.pin);
  if (owned && !r.left.length) { journal.close(ctx.journal); ctx.journal = null; }
  else if (owned) ctx.say('the journal stays open (' + ctx.journal.file + '): the next command restores from it first');
  return r;
}

export async function runScenarios(ctx, scenarios) {
  // Every wait and the key guard read the parts' probes; without them nothing could be checked or pressed safely.
  await probingUp(ctx);
  ctx.tv.resetKeys();
  await ctx.tv.ensureKeys();
  const owned = await baseline(ctx);
  const start = ctx.journal.baseline;
  ctx.note('start', start);
  const runs = [];
  for (const sc of scenarios) {
    if (ctx.aborted) break;
    ctx.scenario = sc;
    const cur = ctx.current = { id: sc.id, title: sc.title, checks: [], captures: [], keys: [], status: 'pass', reason: '', tvChecks: sc.tvChecks || [] };
    runs.push(cur);
    ctx.say('\n== ' + sc.id + ': ' + sc.title);
    try {
      const why = await closeAll(ctx);
      if (why) throw new Error(why);
      await sc.run(ctx);
    } catch (e) {
      if (e instanceof Skip) { cur.status = 'skip'; cur.reason = e.message; ctx.say('  skip: ' + e.message); }
      else { cur.status = 'fail'; cur.reason = e.message; ctx.say('  FAIL: ' + e.message); }
    }
    if (ctx.aborted) break;
    try {
      const why = await closeAll(ctx);
      if (why) ctx.check('everything of ours closed', false, why);
      if (sc.cleanup) await sc.cleanup(ctx);
      const r = await restoreVerified(ctx, start, ctx.secrets.pin);
      if (r.acted.length) ctx.note(sc.id + '.restored', r.acted);
      if (!ctx.check('the TV is as it was (read back after the restore)', !r.left.length, r.left.join('; ') || (r.acted.length ? 'restored: ' + r.acted.join(', ') : ''))) {
        cur.status = 'fail'; cur.reason = cur.reason || 'not restored: ' + r.left.join('; ');
      } else if (r.acted.length && cur.status === 'pass') { cur.status = 'fail'; cur.reason = 'left changed, then restored: ' + r.acted.join(', '); }
    } catch (e) {
      cur.status = 'fail';
      cur.reason = cur.reason || 'cleanup: ' + e.message;
    }
    if (cur.status === 'pass' && cur.checks.some((c) => !c.ok)) { cur.status = 'fail'; cur.reason = cur.checks.find((c) => !c.ok).name; }
  }
  ctx.scenario = { id: 'end' };
  const summary = ctx.current = { checks: [], captures: [], keys: [] };
  const r = await finish(ctx, owned);
  ctx.check('the TV is back to the baseline, read back', !r.left.length, r.left.join('; '));
  const owner = start.look && start.look.style === 'smoke' && JSON.stringify(start.look.themes) === '["halloween"]';
  ctx.note('ownerLook', owner);
  ctx.say(owner ? "the look at the start was the owner's (smoke + halloween), and is again" : 'note: the look at the start was ' + JSON.stringify(start.look) + ", not the owner's smoke + halloween; it was put back as found");
  return { runs, end: summary.checks, notes: ctx.notes };
}
