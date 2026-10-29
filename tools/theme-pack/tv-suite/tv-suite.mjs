#!/usr/bin/env node
// The TV integration suite: put what is built on the TV, drive every built screen with remote keys, and show each
// capture beside its board. See the README's "TV integration suite".
//
//   node tv-suite.mjs deploy [OUT_DIR] [--from STEP] [--only STEP] [--check]
//   node tv-suite.mjs coldboot [OUT_DIR]          reboot, then the checks that count only after a boot
//   node tv-suite.mjs manual [OUT_DIR] [--item ID]... [--no-later]     | manual --print
//   node tv-suite.mjs run [OUT_DIR] [--scenario ID]...                 | run --list (the fallback-* run only when named)
//   node tv-suite.mjs baseline                    read-only preflight: every baseline value readable, probes fresh, keys
//   node tv-suite.mjs rollback                    put back what deploy's backup holds | rollback --print
//   node tv-suite.mjs report OUT_DIR [--boards CANVAS_DIR] [--preview RENDER_DIR]
// Without --live every command runs against the fake TV (fake/), whatever TV_HOST says. With --live it talks to
// root@$TV_HOST. Every command that touches the TV first restores from a journal an interrupted command left, and
// on SIGINT, SIGTERM or an error it restores from its own journal before it exits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import readline from 'node:readline';
import { makeTv } from './lib/tv.mjs';
import { deploy } from './lib/deploy.mjs';
import { makeCtx, runScenarios, closeAll, snapshot, predatesProbing, DEPLOY_FIRST } from './lib/run.mjs';
import { SCENARIOS } from './lib/scenarios.mjs';
import { writeReport } from './lib/report.mjs';
import { coldboot } from './lib/coldboot.mjs';
import { manual, printChecklist } from './lib/manual.mjs';
import { rollback, printRollback } from './lib/backup.mjs';
import { settle, resolve } from './lib/recover.mjs';
import * as journal from './lib/journal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parse(argv) {
  const o = { cmd: argv[0], pos: [], scenarios: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
    else if (a === '--live') o.live = true;
    else if (a === '--from') o.from = argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--check') o.check = true;
    else if (a === '--scenario') o.scenarios.push(argv[++i]);
    else if (a === '--list') o.list = true;
    else if (a === '--boards') o.boards = argv[++i];
    else if (a === '--preview') o.preview = argv[++i];
    else if (a === '--fake-state') o.fakeState = argv[++i];
    else if (a === '--poll') o.poll = Number(argv[++i]);
    else if (a === '--item') (o.items = o.items || []).push(argv[++i]);
    else if (a === '--print') o.print = true;
    else if (a === '--no-later') o.noLater = true;
    else if (a.startsWith('--')) throw new Error('unknown option ' + a);
    else o.pos.push(a);
  }
  return o;
}

// A dry run: the fake TV's ssh and scp first on PATH, its state in a file, and a host that resolves nowhere.
async function fake(o) {
  const { initialState } = await import('./fake/tv.mjs');
  const f = o.fakeState || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-fake-')), 'tv.json');
  if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(initialState()));
  process.env.TV_SUITE_FAKE = f;
  process.env.PATH = path.join(here, 'fake') + path.delimiter + process.env.PATH;
  process.env.TV_HOST = 'tv.invalid';
  // The journal pointer for the fake lives beside its state, never with a real TV's.
  process.env.TV_SUITE_STATE = path.dirname(f);
  console.log('dry run: fake TV state in ' + f);
  return f;
}

// The command in flight, for the signal handler: its context and how to make a fresh connection for the restore.
const live = { ctx: null, fresh: null, restoring: null, code: 0, probing: false, keepalive: null };

// Probing off at the end of every command (normal, error, signal).
export async function probingOff(ctx) {
  if (live.keepalive) clearInterval(live.keepalive);
  live.keepalive = null;
  if (!live.probing || !ctx) return;
  live.probing = false;
  await ctx.tv.setProbing(false).catch((e) => console.error('note: probing could not be turned off (' + e.message + '); it expires by itself'));
}

// Stops the command and restores the TV from the journal (on a fresh connection; the command's own is cut off).
export function interrupt(why, say = console.log) {
  if (live.restoring) return live.restoring;
  const ctx = live.ctx;
  if (!ctx) return Promise.resolve(130);
  ctx.aborted = true;
  ctx.tv.abort();
  live.restoring = (async () => {
    say('\n' + why + ': stopping, and restoring the TV from the journal');
    const c2 = live.fresh();
    c2.secrets = ctx.secrets;
    const j = journal.pending(ctx.tv.host);
    try {
      await c2.tv.setProbing(true).catch(() => {});
      if (j) await resolve(c2, j);
      else { const w = await closeAll(c2).catch((e) => e.message); if (w) say('  ' + w); say('  no journal open: nothing to restore'); }
      return 130;
    } catch (e) {
      say('NOT RESTORED: ' + e.message);
      return 3;
    } finally {
      await probingOff(c2);
    }
  })();
  return live.restoring;
}

export async function main(argv, say = console.log) {
  const o = parse(argv);
  if (o.cmd === 'run' && o.list) { for (const s of SCENARIOS) say(s.id.padEnd(24) + (s.optIn ? '(only when named) ' : '') + s.title); return 0; }
  if (o.cmd === 'manual' && o.print) { printChecklist(say); return 0; }
  if (o.cmd === 'rollback' && o.print) { printRollback(say); return 0; }
  if (o.cmd === 'report') {
    if (!o.pos[0]) throw new Error('usage: tv-suite.mjs report OUT_DIR [--boards DIR] [--preview DIR]');
    say(await writeReport(o.pos[0], { boards: o.boards, preview: o.preview, say }));
    return 0;
  }
  if (!['deploy', 'coldboot', 'manual', 'run', 'rollback', 'baseline'].includes(o.cmd)) throw new Error('usage: tv-suite.mjs deploy | coldboot | manual | run | rollback | report [--live]');
  if (o.live && o.dry) throw new Error('--live and --dry-run together');
  if (!o.live) { o.dry = true; if (process.env.TV_HOST && !o.fakeState) say('no --live: a dry run against the fake TV, not ' + process.env.TV_HOST); }
  if (o.dry) await fake(o);
  // A dry run talks to the fake in this process, on its state file (the repo scripts reach the same file through the
  // PATH shims), with its waits shortened.
  let exec, sleep;
  if (o.dry) {
    const f = await import('./fake/tv.mjs');
    exec = f.fileBacked(process.env.TV_SUITE_FAKE);
    sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50)));
  }
  const poll = o.poll || (o.dry ? 20 : 250);
  const outDir = () => { const d = path.resolve(o.pos[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-' + o.cmd + '-'))); fs.mkdirSync(d, { recursive: true }); return d; };
  const out = outDir();
  const fresh = () => makeCtx({ tv: makeTv(exec ? { exec } : {}), out, say, poll, sleep });
  const ctx = fresh();
  live.ctx = ctx;
  live.fresh = fresh;
  // Probing on for this command (and kept alive), off again however it ends; then an interrupted command's journal:
  // nothing new starts until the TV is verified back.
  live.probing = true;
  const probingWhy = await ctx.tv.setProbing(true).then(() => '', (e) => e.message);
  if (probingWhy) say(predatesProbing(probingWhy) ? 'note: ' + DEPLOY_FIRST : 'note: probing could not be turned on yet: ' + probingWhy);
  live.keepalive = setInterval(() => { ctx.tv.setProbing(true).catch(() => {}); }, 120000);
  live.keepalive.unref();
  await settle(ctx);

  if (o.cmd === 'baseline') {
    // A read-only preflight: every value the baseline needs, readable or not (the PIN only as readable), the probes'
    // age and the key socket. Nothing is changed and no journal is opened.
    const b = await snapshot(ctx);
    let bad = 0;
    for (const [k, v] of Object.entries(b.values)) {
      const u = v && v.unreadable;
      if (u) bad++;
      say((u ? 'UNREADABLE ' : 'ok         ') + k + ': ' + (u ? v.unreadable : JSON.stringify(v)));
    }
    say((b.pin === undefined ? 'UNREADABLE ' : 'ok         ') + 'PIN (lock.systemPin; its value is never shown)');
    if (b.pin === undefined) bad++;
    if (predatesProbing(probingWhy)) {
      say('DEPLOY     ' + DEPLOY_FIRST + '. The values above are read; the probes and keys are checked after the deploy.');
      return 4;
    }
    let st = await ctx.state();
    for (let w = 0; w < 20 && !st.fresh; w++) { await ctx.sleep(500); st = await ctx.state(); }
    say((st.fresh ? 'ok         ' : 'STALE      ') + 'probes: ' + (st.fresh ? 'fresh' : st.stale) + '; system UI in front: ' + (st.systemUi || 'none'));
    const k = await ctx.tv.ensureKeys().then(() => '', (e) => e.message);
    say((k ? 'MISSING    ' : 'ok         ') + 'key socket' + (k ? ': ' + k : ''));
    return bad || !st.fresh || k ? 1 : 0;
  }
  if (o.cmd === 'deploy') {
    const r = await deploy(ctx, { from: o.from, only: o.only, checkOnly: o.check });
    fs.writeFileSync(path.join(out, 'deploy.json'), JSON.stringify(r, null, 1));
    say(r.ok ? '\ndeployed' : '\nstopped at ' + r.step + ': ' + r.reason);
    return r.ok ? 0 : 1;
  }
  if (o.cmd === 'rollback') {
    const r = await rollback(ctx);
    return r.ok ? 0 : 1;
  }
  if (o.cmd === 'run') {
    const unknown = o.scenarios.filter((id) => !SCENARIOS.some((s) => s.id === id));
    if (unknown.length) throw new Error('no scenario ' + unknown.join(', ') + ' (see --list)');
    // The fallback scenarios restart the compositor twice each: they run only when named.
    const pick = o.scenarios.length ? SCENARIOS.filter((s) => o.scenarios.includes(s.id)) : SCENARIOS.filter((s) => !s.optIn);
    const started = new Date().toISOString();
    const r = await runScenarios(ctx, pick);
    const results = { started, finished: new Date().toISOString(), host: o.dry ? 'fake' : 'TV', dry: !!o.dry, runs: r.runs, end: r.end, notes: r.notes };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
    const failed = r.runs.filter((x) => x.status === 'fail').length + r.end.filter((c) => !c.ok).length;
    say('\n' + r.runs.map((x) => x.status.toUpperCase().padEnd(5) + x.id + (x.reason ? ': ' + x.reason : '')).join('\n'));
    say('results: ' + path.join(out, 'results.json') + '  (contact sheet: node ' + path.relative(process.cwd(), path.join(here, 'tv-suite.mjs')) + ' report ' + out + ')');
    return failed ? 1 : 0;
  }
  if (o.cmd === 'coldboot') {
    const r = await coldboot(ctx, o.dry ? { upTimeout: 30, hookTimeout: 30 } : {});
    fs.writeFileSync(path.join(out, 'coldboot.json'), JSON.stringify(r, null, 1));
    say('\n' + (r.ok ? 'PASS' : 'FAIL') + ' coldboot: ' + JSON.stringify(r.timings) + '  (' + path.join(out, 'coldboot.json') + ')');
    return r.ok ? 0 : 1;
  }
  // manual
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => process.emit('SIGINT', 'SIGINT'));
  const lines = [];
  let waiting = null, closed = false;
  rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
  rl.on('close', () => { closed = true; if (waiting) { const w = waiting; waiting = null; w('s'); } });
  const answer = (q) => { process.stdout.write(q); if (lines.length) return Promise.resolve(lines.shift()); if (closed) return Promise.resolve('s'); return new Promise((r) => { waiting = r; }); };
  const r = [];
  try { await manual(ctx, { answer, only: o.items, includeLater: !o.noLater, results: r }); }
  finally {
    rl.close();
    // Written however the pass ends (a STOP keeps the verdicts so far).
    fs.writeFileSync(path.join(out, 'manual.json'), JSON.stringify({ items: r, end: r.end, notes: ctx.notes }, null, 1));
  }
  say('\n' + r.map((x) => x.verdict.toUpperCase().padEnd(5) + x.id + (x.note ? ': ' + x.note : '')).join('\n'));
  say('recorded: ' + path.join(out, 'manual.json'));
  return r.some((x) => x.verdict === 'fail') || (r.end || []).some((c) => !c.ok) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { interrupt(sig).then((c) => process.exit(c)); });
  process.on('uncaughtException', (e) => { console.error(e && e.stack || e); interrupt('error').then((c) => process.exit(c === 130 ? 2 : c)); });
  main(process.argv.slice(2)).then(
    async (c) => { if (live.restoring) c = await live.restoring; else await probingOff(live.ctx); process.exit(c); },
    async (e) => {
      if (live.restoring) process.exit(await live.restoring);
      console.error(e.message);
      // An error with a journal open: the TV is restored before the exit (interrupt turns probing off).
      const code = live.ctx && journal.pending(live.ctx.tv.host) ? await interrupt('error') : (await probingOff(live.ctx), 2);
      process.exit(code === 130 ? 2 : code);
    });
}
