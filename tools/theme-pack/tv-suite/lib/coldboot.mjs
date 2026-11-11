// A cold boot of the TV and the checks that only count straight after one, in order, before anything else launches
// Settings: the stub mounted by the hook, no stock Settings resident, the redirect scenario, the host-ready report,
// the telemetry state after the hook, and Hook A. Reports the boot's timings (seconds since power-on). Running it
// again reboots again: it changes nothing else.
import path from 'node:path';
import { runScenarios, baseline, finish, restoreVerified, probingUp } from './run.mjs';
import { SCENARIOS } from './scenarios.mjs';

const HOOK_END = /^(settings stub mounted|settings already mounted|settings left stock .*)$/;
const SETTINGS_APP = '/usr/palm/applications/com.palm.app.settings';

export async function coldboot(ctx, { upTimeout = 600, hookTimeout = 300 } = {}) {
  const { tv } = ctx;
  const out = { timings: {}, checks: [] };
  const before = await tv.clock();
  if (!before) throw new Error('the TV does not answer ssh before the reboot');
  // The baseline before the reboot (the input in front included), journalled: an interrupt anywhere from here on
  // is restored to it, and the end restores to it, read back.
  const owned = await baseline(ctx);
  const fg0 = ctx.journal.baseline.foreground;
  out.foreground = { before: fg0 };
  ctx.say('rebooting the TV (up ' + Math.round(before.up) + ' s, ' + (fg0 || 'nothing') + ' in front)');
  await tv.disconnect().catch(() => {});
  await tv.sh('(sleep 1; reboot) </dev/null >/dev/null 2>&1 &', { fresh: true, timeout: 15000 });
  const t0 = Date.now();
  // Back when it answers with an uptime that started after the reboot was asked for.
  // Back when it answers again after not answering, or with an uptime below the one it had.
  let up = null, down = false;
  while ((Date.now() - t0) / 1000 < upTimeout) {
    await ctx.sleep(3000);
    const c = await tv.clock().catch(() => null);
    if (!c) { down = true; continue; }
    if (down || c.up < before.up) { up = c; break; }
  }
  if (!up) throw new Error('the TV did not come back on ssh within ' + upTimeout + ' s');
  const boot = up.now - up.up;
  out.timings.sshUp = round(up.up);
  // A boot drops LG's on-demand key socket; runScenarios asks for it again.
  tv.resetKeys();
  ctx.say('ssh up ' + out.timings.sshUp + ' s after power-on');
  // The hook's last line is one of its Settings verdicts.
  let last = '';
  const h0 = Date.now();
  while ((Date.now() - h0) / 1000 < hookTimeout) {
    last = (await tv.sh('tail -1 /tmp/themepack.log 2>/dev/null', { timeout: 15000 })).stdout.trim();
    if (HOOK_END.test(last)) break;
    await ctx.sleep(2000);
  }
  const c = await tv.clock();
  if (!HOOK_END.test(last)) throw new Error('the boot hook did not finish within ' + hookTimeout + ' s (last line: ' + (last || 'none') + ')');
  out.timings.hookDone = round(c.up);
  const since = new Date(boot * 1000).toISOString();
  const reports = await tv.reports(since);
  const at = (text) => { const r = reports.find((x) => x.text === text); return r ? round(Date.parse(r.at) / 1000 - boot) : null; };
  out.timings.layerReady = at('layer created by injection');
  out.timings.hostReady = at('settings: host ready');
  ctx.say('boot timings (s since power-on): ' + JSON.stringify(out.timings));

  ctx.scenario = { id: 'coldboot' };
  ctx.current = { checks: out.checks, captures: [], keys: [] };
  ctx.check('the hook mounted the stub', /^settings (stub|already) mounted$/.test(last), last);
  const m = await tv.sh('mount');
  ctx.check('mount lists the bind over LG\'s Settings', m.stdout.includes(' ' + SETTINGS_APP + ' '));
  const running = ((await tv.luna('luna://com.webos.applicationManager/running', {})).running || []).map((a) => a.id);
  ctx.check('no stock Settings is resident after boot', !running.includes('com.palm.app.settings'), running.join(', '));
  // The boot restarted the Look service with probing off: on again before anything is judged.
  await probingUp(ctx, 30000);
  // The boot comes up on LG's default input: back to the baseline's first (launching the input that was in front,
  // restoring, not switching), so the redirect runs where the household was.
  out.foreground.afterBoot = await ctx.foreground().catch(() => '');
  const early = await restoreVerified(ctx, ctx.journal.baseline);
  if (early.acted.length) ctx.say('  restored after the boot: ' + early.acted.join(', '));
  // Its captures go under coldboot/, so a later `run` into the same directory keeps them.
  const outDir = ctx.out;
  ctx.out = path.join(outDir, 'coldboot');
  const r = await runScenarios(ctx, SCENARIOS.filter((s) => s.id === 'redirect')).finally(() => { ctx.out = outDir; });
  for (const c of r.runs[0].captures) c.file = path.join('coldboot', c.file);
  out.redirect = r.runs[0];
  ctx.scenario = { id: 'coldboot' };
  ctx.current = { checks: out.checks, captures: [], keys: [] };
  ctx.check('redirect, first after the boot', r.runs[0].status === 'pass', r.runs[0].reason);
  ctx.check('"settings: host ready" reported this boot', out.timings.hostReady !== null);
  // The clock reads whole seconds, hence the second of slack.
  ctx.check('the stub was mounted only after it', out.timings.hostReady !== null && out.timings.hostReady <= out.timings.hookDone + 1,
    'host ready ' + out.timings.hostReady + ' s, hook done ' + out.timings.hookDone + ' s');
  const tel = await tv.luna('luna://dev.themepack.look.service/getTelemetry', {}).catch((e) => ({ kit: 'no answer: ' + e.message }));
  out.telemetry = tel.kit;
  ctx.check('getTelemetry answers after the hook', ['active', 'inactive', 'unknown'].includes(tel.kit), tel.kit);
  ctx.check('Hook A: the gear opens our quick sheet', reports.some((x) => x.kind === 'ok' && x.text === 'settings: the gear opens our quick sheet (system UI table)'),
    (reports.find((x) => /Hook A|Quick Settings/.test(x.text)) || {}).text || 'no Hook A report');
  const back = await finish(ctx, owned);
  const fg = await ctx.foreground().catch(() => '');
  out.foreground.restored = fg === fg0;
  ctx.check('the TV is back to the baseline from before the reboot, read back', !back.left.length, back.left.join('; '));
  ctx.check('the input is back on ' + (fg0 || 'what was in front'), fg === fg0, out.foreground.afterBoot !== fg0 ? 'the boot came up on ' + out.foreground.afterBoot + '; restored by launching ' + fg0 : fg);
  out.ok = out.checks.every((x) => x.ok);
  return out;
}

const round = (x) => Math.round(x * 10) / 10;
