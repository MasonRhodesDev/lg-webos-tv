// Runs the scenarios: each one checks its preconditions, presses keys only through the guard (keys.mjs), waits by
// polling the TV's state (the parts' probes, luna gets), captures, asserts, and cleans up. Around every scenario the
// suite snapshots the TV's settings and fails the scenario if any changed, restoring them.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { guard } from './keys.mjs';
import { settingKey } from './expect.mjs';

const SVC = 'luna://dev.themepack.look.service';
const SS = 'luna://com.webos.settingsservice';

// What a scenario must leave as it found it. The volume, the Look and the write scenarios' settings are changed on
// purpose, and put back by the scenario; anything still different afterwards fails it and is restored here.
const WATCHED = ['pictureMode', 'energySaving', 'soundOutput', 'soundMode', 'deviceName', 'parentalControl', 'quickStartMode'];

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
    async state() {
      const p = await tv.probes();
      let systemUi = '';
      try { systemUi = (await tv.luna('luna://com.webos.service.systemUIManager/getForegroundAppInfo', {})).appId || ''; } catch (e) { /* no answer: none in front */ }
      return { settings: p.Settings || null, picker: p.InputPicker || null, toast: p.Toast || null, volume: p.VolumeBar || null,
               mute: p.VolumeMute || null, systemUi };
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
    async key(name, allow = {}) {
      const st = await ctx.state();
      const why = guard(name, st, allow);
      if (why) { ctx.check('key ' + name + ' allowed', false, why); throw new Refused(why); }
      ctx.current && ctx.current.keys.push(name);
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

// Everything a scenario must not change, read from the TV. The PIN is kept only as a hash.
async function snapshot(ctx) {
  const s = {};
  try { s.look = await ctx.look(); } catch (e) { s.look = 'unreadable: ' + e.message; }
  try { s.volume = await ctx.volume(); } catch (e) { s.volume = 'unreadable'; }
  try { s.foreground = await ctx.foreground(); } catch (e) { s.foreground = 'unreadable'; }
  for (const id of WATCHED) { try { s[id] = await ctx.setting(id); } catch (e) { s[id] = 'unreadable'; } }
  try {
    const pin = await ctx.tv.luna(SS + '/getSystemSettings', { category: 'lock', keys: ['systemPin'] });
    s.pin = pin.settings && pin.settings.systemPin !== undefined ? crypto.createHash('sha256').update(String(pin.settings.systemPin)).digest('hex').slice(0, 12) : 'unreadable';
  } catch (e) { s.pin = 'unreadable'; }
  try {
    const c = await ctx.tv.luna('luna://com.webos.service.connectionmanager/getstatus', {});
    s.network = JSON.stringify({ wired: c.wired && c.wired.state, wifi: c.wifi && c.wifi.state, ssid: c.wifi && c.wifi.ssid });
  } catch (e) { s.network = 'unreadable'; }
  return s;
}

// Closes whatever of ours is open with Back (the guard always lets Back through to our menus), and LG's input
// picker with closeByAppId.
export async function closeAll(ctx) {
  for (let i = 0; i < 12; i++) {
    const s = await ctx.settings();
    if (!(s.menu && s.menu.open) && !(s.quick && s.quick.open)) break;
    await ctx.tv.keys(['BACK']);
    await ctx.sleep(ctx.poll);
  }
  const st = await ctx.state();
  if ((st.picker && st.picker.shown) || st.systemUi === 'com.webos.app.quickinputpicker')
    await ctx.luna('luna://com.webos.service.systemUIManager/closeByAppId', { id: 'com.webos.app.quickinputpicker' });
}

async function restore(ctx, before, after) {
  const changed = [];
  for (const k of Object.keys(before)) {
    if (JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
    changed.push(k + ' ' + (k === 'pin' ? '(hash) ' : '') + JSON.stringify(before[k]) + ' -> ' + JSON.stringify(after[k]));
    try {
      if (k === 'look') await ctx.setLook(before.look);
      else if (k === 'volume' && typeof before.volume === 'object') {
        await ctx.luna('luna://com.webos.audio/setVolume', { volume: before.volume.volume });
        if (after.volume.muted !== before.volume.muted) await ctx.luna('luna://com.webos.audio/setMute', { mute: before.volume.muted });
      } else if (WATCHED.includes(k) && before[k] !== 'unreadable') {
        const sk = settingKey(k);
        await ctx.luna(SS + '/setSystemSettings', { category: sk.category, settings: { [sk.key]: before[k] } });
      }
    } catch (e) { changed.push('  could not restore ' + k + ': ' + e.message); }
  }
  return changed;
}

export async function runScenarios(ctx, scenarios) {
  // Every wait and the key guard read the parts' probes; without them nothing could be checked or pressed safely.
  let probes = {};
  try { probes = await ctx.tv.probes(); } catch (e) { throw new Error('the Look service does not answer getProbe (' + e.message + '): deploy this branch first'); }
  if (!probes.Settings) throw new Error('the layer on the TV publishes no probe for our Settings: deploy this branch first (tv-suite.mjs deploy)');
  const runs = [];
  const start = await snapshot(ctx);
  ctx.note('start', start);
  for (const sc of scenarios) {
    ctx.scenario = sc;
    const cur = ctx.current = { id: sc.id, title: sc.title, checks: [], captures: [], keys: [], status: 'pass', reason: '', tvChecks: sc.tvChecks || [] };
    runs.push(cur);
    ctx.say('\n== ' + sc.id + ': ' + sc.title);
    let before = null;
    try {
      await closeAll(ctx);
      before = await snapshot(ctx);
      await sc.run(ctx);
    } catch (e) {
      if (e instanceof Skip) { cur.status = 'skip'; cur.reason = e.message; ctx.say('  skip: ' + e.message); }
      else { cur.status = 'fail'; cur.reason = e.message; ctx.say('  FAIL: ' + e.message); }
    }
    try {
      await closeAll(ctx);
      if (sc.cleanup) await sc.cleanup(ctx);
      if (before) {
        const changed = await restore(ctx, before, await snapshot(ctx));
        if (!ctx.check('the TV is as it was', !changed.length, changed.join('; '))) { cur.status = 'fail'; cur.reason = cur.reason || 'changed: ' + changed.join('; '); }
      }
    } catch (e) {
      cur.status = 'fail';
      cur.reason = cur.reason || 'cleanup: ' + e.message;
    }
    if (cur.status === 'pass' && cur.checks.some((c) => !c.ok)) { cur.status = 'fail'; cur.reason = cur.checks.find((c) => !c.ok).name; }
  }
  ctx.scenario = { id: 'end' };
  ctx.current = { checks: [], captures: [], keys: [] };
  const end = await snapshot(ctx);
  const changed = await restore(ctx, start, end);
  const summary = { checks: [] };
  ctx.current = summary;
  ctx.check('the Look is restored', JSON.stringify(start.look) === JSON.stringify((await snapshot(ctx)).look), JSON.stringify(start.look));
  ctx.check('nothing changed over the whole run', !changed.length, changed.join('; '));
  const owner = start.look && start.look.style === 'smoke' && JSON.stringify(start.look.themes) === '["halloween"]';
  ctx.note('ownerLook', owner);
  ctx.say(owner ? "the look at the start was the owner's (smoke + halloween), and is again" : 'note: the look at the start was ' + JSON.stringify(start.look) + ", not the owner's smoke + halloween; it was put back as found");
  return { runs, end: summary.checks, notes: ctx.notes };
}
