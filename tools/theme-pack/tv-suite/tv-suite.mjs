#!/usr/bin/env node
// The TV integration suite: put what is built on the TV, drive every built screen with remote keys, and show each
// capture beside its board. See README.md next to this file.
//
//   TV_HOST=<address> node tv-suite.mjs deploy [OUT_DIR] [--from STEP] [--only STEP] [--check]
//   TV_HOST=<address> node tv-suite.mjs run [OUT_DIR] [--scenario ID]... [--list]
//   node tv-suite.mjs report OUT_DIR [--boards CANVAS_DIR] [--preview RENDER_DIR]
//   TV_HOST=<address> node tv-suite.mjs coldboot [OUT_DIR]      reboot, then the checks that count only after a boot
//   TV_HOST=<address> node tv-suite.mjs manual [OUT_DIR] [--item ID]... [--print] [--no-later]
//   TV_HOST=<address> node tv-suite.mjs rollback
//   ... --dry-run    against a fake TV (fake/), no TV needed
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTv } from './lib/tv.mjs';
import { deploy, STEPS } from './lib/deploy.mjs';
import { makeCtx, runScenarios } from './lib/run.mjs';
import { SCENARIOS } from './lib/scenarios.mjs';
import { writeReport } from './lib/report.mjs';
import { coldboot } from './lib/coldboot.mjs';
import { manual, printChecklist } from './lib/manual.mjs';
import readline from 'node:readline';

const here = path.dirname(fileURLToPath(import.meta.url));

export function parse(argv) {
  const o = { cmd: argv[0], pos: [], scenarios: [] };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dry = true;
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
  console.log('dry run: fake TV state in ' + f);
  return f;
}

export async function main(argv, say = console.log) {
  const o = parse(argv);
  if (o.dry) await fake(o);
  if (o.cmd === 'run' && o.list) {
    for (const s of SCENARIOS) say(s.id.padEnd(20) + s.title);
    return 0;
  }
  if (o.cmd === 'manual' && o.print) { printChecklist(say); return 0; }
  if (o.cmd === 'report') {
    if (!o.pos[0]) throw new Error('usage: tv-suite.mjs report OUT_DIR [--boards DIR] [--preview DIR]');
    const file = await writeReport(o.pos[0], { boards: o.boards, preview: o.preview, say });
    say(file);
    return 0;
  }
  // A dry run talks to the fake in this process, on its state file (the repo scripts reach the same file through the
  // PATH shims), with its waits shortened.
  let exec, sleep;
  if (o.dry) {
    const f = await import('./fake/tv.mjs');
    exec = f.fileBacked(process.env.TV_SUITE_FAKE);
    sleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50)));
  }
  const tv = makeTv(exec ? { exec } : {});
  const ctx = makeCtx({ tv, out: '', say, poll: o.poll || (o.dry ? 20 : 250), sleep });
  if (o.cmd === 'deploy') {
    const r = await deploy(ctx, { from: o.from, only: o.only, checkOnly: o.check });
    if (o.pos[0]) { fs.mkdirSync(o.pos[0], { recursive: true }); fs.writeFileSync(path.join(o.pos[0], 'deploy.json'), JSON.stringify(r, null, 1)); }
    say(r.ok ? '\ndeployed' : '\nstopped at ' + r.step + ': ' + r.reason);
    return r.ok ? 0 : 1;
  }
  if (o.cmd === 'rollback') {
    say('Run these, in order (newest step first):');
    for (const s of STEPS.slice().reverse()) say('  ' + s.rollback + (s.rollbackNote ? '   # ' + s.rollbackNote : ''));
    return 0;
  }
  if (o.cmd === 'run') {
    const out = path.resolve(o.pos[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-run-')));
    fs.mkdirSync(out, { recursive: true });
    ctx.out = out;
    const unknown = o.scenarios.filter((id) => !SCENARIOS.some((s) => s.id === id));
    if (unknown.length) throw new Error('no scenario ' + unknown.join(', ') + ' (see --list)');
    const pick = o.scenarios.length ? SCENARIOS.filter((s) => o.scenarios.includes(s.id)) : SCENARIOS;
    const started = new Date().toISOString();
    const r = await runScenarios(ctx, pick);
    const results = { started, finished: new Date().toISOString(), host: o.dry ? 'fake' : 'TV', dry: !!o.dry, runs: r.runs, end: r.end, notes: r.notes };
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
    const failed = r.runs.filter((x) => x.status === 'fail').length + r.end.filter((c) => !c.ok).length;
    say('\n' + r.runs.map((x) => x.status.toUpperCase().padEnd(5) + x.id + (x.reason ? ': ' + x.reason : '')).join('\n'));
    say('results: ' + path.join(out, 'results.json') + '  (contact sheet: node ' + path.relative(process.cwd(), path.join(here, 'tv-suite.mjs')) + ' report ' + out + ')');
    return failed ? 1 : 0;
  }
  const outDir = () => { const d = path.resolve(o.pos[0] || fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-' + o.cmd + '-'))); fs.mkdirSync(d, { recursive: true }); return d; };
  if (o.cmd === 'coldboot') {
    ctx.out = outDir();
    const r = await coldboot(ctx, o.dry ? { upTimeout: 30, hookTimeout: 30 } : {});
    fs.writeFileSync(path.join(ctx.out, 'coldboot.json'), JSON.stringify(r, null, 1));
    say('\n' + (r.ok ? 'PASS' : 'FAIL') + ' coldboot: ' + JSON.stringify(r.timings) + '  (' + path.join(ctx.out, 'coldboot.json') + ')');
    return r.ok ? 0 : 1;
  }
  if (o.cmd === 'manual') {
    ctx.out = outDir();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    let waiting = null, closed = false;
    rl.on('line', (l) => { if (waiting) { const w = waiting; waiting = null; w(l); } else lines.push(l); });
    rl.on('close', () => { closed = true; if (waiting) { const w = waiting; waiting = null; w('s'); } });
    const answer = (q) => { process.stdout.write(q); if (lines.length) return Promise.resolve(lines.shift()); if (closed) return Promise.resolve('s'); return new Promise((r) => { waiting = r; }); };
    const r = await manual(ctx, { answer, only: o.items, includeLater: !o.noLater });
    rl.close();
    fs.writeFileSync(path.join(ctx.out, 'manual.json'), JSON.stringify({ items: r, notes: ctx.notes }, null, 1));
    say('\n' + r.map((x) => x.verdict.toUpperCase().padEnd(5) + x.id + (x.note ? ': ' + x.note : '')).join('\n'));
    say('recorded: ' + path.join(ctx.out, 'manual.json'));
    return r.some((x) => x.verdict === 'fail') ? 1 : 0;
  }
  throw new Error('usage: tv-suite.mjs deploy | run | coldboot | manual | report | rollback [--dry-run]');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = 2; });
}
