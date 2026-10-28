// Puts everything that is built on the TV, step by step, with a check after each step and the rollback printed. It
// stops at the first failed check with the reason. Every step can run again: it reinstalls the same thing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCmd } from './tv.mjs';
import { backup, BACKUP } from './backup.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const THEME = path.join(here, '..', '..');
const rel = (f) => 'tools/theme-pack/' + f;
const APP = JSON.parse(fs.readFileSync(path.join(THEME, 'tv', 'appinfo.json'), 'utf8'));
const SETTINGS_APP = '/usr/palm/applications/com.palm.app.settings';

// A repo script with TV_HOST set, its output echoed and kept.
async function script(ctx, file, args) {
  ctx.say('$ TV_HOST=$TV_HOST sh ' + rel(file) + ' ' + args.join(' '));
  const r = await spawnCmd('sh', [path.join(THEME, file), ...args], { env: Object.assign({}, process.env, { TV_HOST: ctx.tv.host }), timeout: 30 * 60000 });
  const out = (r.stdout + r.stderr).replace(/\r/g, '');
  for (const l of out.split('\n').filter(Boolean)) ctx.say('  | ' + l);
  return { status: r.status, out };
}
const lastLine = (out) => out.trim().split('\n').filter(Boolean).pop() || '(no output)';

// Waits for a report since `t0` that `match` picks, or fails with what arrived instead.
async function waitReport(ctx, t0, match, seconds) {
  for (let i = 0; i < seconds * 2; i++) {
    const rs = await ctx.tv.reports(t0);
    const hit = rs.find(match);
    if (hit) return { hit, rs };
    if (i < seconds * 2 - 1) await ctx.sleep(500);
  }
  return { hit: null, rs: await ctx.tv.reports(t0) };
}

export const STEPS = [
  {
    id: 'backup',
    title: 'keep what deploy replaces (the boot hook, the old Settings, the layer and stub dirs), once',
    rollback: 'node tools/theme-pack/tv-suite/tv-suite.mjs rollback --live',
    rollbackNote: 'puts back exactly what this backup holds, then checks it',
    async apply(ctx) {
      const r = await backup(ctx);
      if (r.error) return 'the backup failed, nothing was changed: ' + r.error;
      ctx.note('backup', r.manifest);
      return null;
    },
    async check(ctx) {
      const r = await ctx.tv.sh('cat ' + BACKUP + '/manifest.json');
      try { JSON.parse(r.stdout); return null; } catch (e) { return 'no backup manifest at ' + BACKUP; }
    }
  },
  {
    id: 'look',
    title: 'Look package (app, Look service, permissions.sh)',
    rollback: 'ssh root@$TV_HOST "luna-send -n 1 luna://com.webos.appInstallService/dev/remove \'{\\"id\\":\\"' + APP.id + '\\"}\'"',
    rollbackNote: 'dev/remove is in the TV\'s own schema list (appInstallService.dev.remove.schema); `rollback --live` removes it only if it was not there before',
    async apply(ctx) {
      const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-ipk-'));
      const b = await script(ctx, 'tv/build-ipk.sh', [dist]);
      if (b.status !== 0) return 'build-ipk.sh failed: ' + lastLine(b.out);
      const ipk = lastLine(b.out);
      const i = await script(ctx, 'tv/install-tv.sh', [ipk]);
      if (i.status !== 0) return 'install-tv.sh failed: ' + lastLine(i.out);
      if (/"failed"|errorText/.test(i.out)) return 'the TV refused the package: ' + i.out.split('\n').find((l) => /"failed"|errorText/.test(l)).trim();
      if (!/"installed"/.test(i.out)) return 'the installer never said "installed": ' + lastLine(i.out);
      const groups = i.out.split('\n').find((l) => l.startsWith('compositor groups:'));
      if (!groups) return 'permissions.sh did not run (no "compositor groups:" line)';
      ctx.note('look.groups', groups.trim());
      if (/did not finish/.test(i.out)) return 'ls-control scan-services did not finish';
      return null;
    },
    async check(ctx) {
      const info = await ctx.tv.luna('luna://com.webos.applicationManager/getAppInfo', { id: APP.id });
      const v = info.appInfo && info.appInfo.version;
      if (v !== APP.version) return 'getAppInfo ' + APP.id + ' says version ' + v + ', tv/appinfo.json ' + APP.version;
      const look = await ctx.tv.luna('luna://dev.themepack.look.service/getLook', {});
      if (!look.returnValue) return 'the Look service did not answer getLook: ' + (look.errorText || JSON.stringify(look));
      return null;
    }
  },
  {
    id: 'layer',
    title: 'our UI layer in the compositor (own-layer-tv.sh apply)',
    rollback: 'TV_HOST=$TV_HOST sh ' + rel('webos/own-layer-tv.sh') + ' revert',
    async apply(ctx) {
      ctx.layerT0 = await ctx.tv.now();
      const r = await script(ctx, 'webos/own-layer-tv.sh', ['apply']);
      if (r.status !== 0) return 'own-layer-tv.sh apply failed: ' + lastLine(r.out);
      if (/back to stock/.test(r.out)) return 'the layer did not load: ' + r.out.split('\n').find((l) => /back to stock/.test(l)).trim();
      if (!/layer loaded after/.test(r.out)) return 'own-layer.sh never said "layer loaded": ' + lastLine(r.out);
      return null;
    },
    async check(ctx) {
      const t0 = ctx.layerT0 || '';
      const all = await ctx.tv.reports(t0);
      if (!all.find((r) => r.kind === 'root')) return 'no "own layer root loaded" report' + (t0 ? ' since ' + t0 : '');
      const created = all.find((r) => r.text === 'layer created' || r.text === 'layer could not be created');
      if (!created || created.kind !== 'ready') return created ? 'the root says: ' + created.text : 'no "layer created" report';
      const { hit, rs } = await waitReport(ctx, t0, (r) => r.text === 'settings: host ready' || /^settings: host up, but/.test(r.text), 20);
      const errors = rs.filter((r) => r.kind === 'error');
      if (errors.length) return 'the layer reported errors: ' + errors.map((e) => e.text).join('; ');
      if (!hit) return 'our Settings host never reported (no "settings: host ready")';
      if (hit.kind !== 'ready') return hit.text;
      ctx.note('layer.reports', rs);
      return null;
    }
  },
  {
    id: 'boot',
    title: 'boot hook and Settings stub (install-boot.sh install)',
    rollback: 'TV_HOST=$TV_HOST sh ' + rel('webos/install-boot.sh') + ' remove',
    rollbackNote: 'LG\'s Settings is back at once; the layer stays until the own-layer revert',
    async apply(ctx) {
      const all = await script(ctx, 'webos/install-boot.sh', ['install']);
      if (all.status !== 0) return 'install-boot.sh install failed: ' + lastLine(all.out);
      // The log's tail can hold earlier runs; this run starts at its last "=== " line.
      const at = all.out.lastIndexOf('\n=== ');
      const r = { out: at >= 0 ? all.out.slice(at + 1) : all.out };
      // The hook's own words for why it left LG's Settings: the exact reason.
      const left = r.out.split('\n').reverse().find((l) => /settings left stock|UI layer did not load/.test(l));
      if (left && !/settings (stub|already) mounted/.test(r.out)) return 'the boot hook: ' + left.trim();
      if (!/settings (stub|already) mounted/.test(r.out)) return 'the boot hook never said "settings stub mounted": ' + lastLine(r.out);
      return null;
    },
    async check(ctx) {
      const m = await ctx.tv.sh('mount');
      if (!m.stdout.includes(' ' + SETTINGS_APP + ' ')) return 'mount lists no bind over ' + SETTINGS_APP;
      const info = await ctx.tv.luna('luna://com.webos.applicationManager/getAppInfo', { id: 'com.palm.app.settings' });
      const a = info.appInfo || {};
      // Not a stop: TV-CHECKS asks to record whether SAM serves the stub's description or a cached stock one.
      ctx.note('boot.appInfo', { version: a.version, vendor: a.vendor, usePrerendering: a.usePrerendering });
      if (a.vendor !== 'theme-pack') ctx.say('  note: SAM still serves a ' + (a.vendor || 'stock') + ' description for com.palm.app.settings (see TV-CHECKS, Boot mount)');
      return null;
    }
  }
];

export async function deploy(ctx, { from, only, checkOnly } = {}) {
  let start = from ? STEPS.findIndex((s) => s.id === from) : 0;
  if (start < 0) throw new Error('no step ' + from + ' (steps: ' + STEPS.map((s) => s.id).join(', ') + ')');
  const steps = STEPS.slice(start).filter((s) => !only || s.id === only);
  const done = [], log = [];
  for (const [n, s] of steps.entries()) {
    ctx.say('\n== ' + (n + 1) + '/' + steps.length + ' ' + s.id + ': ' + s.title);
    let why = checkOnly ? null : await s.apply(ctx).catch((e) => e.message);
    if (!why) why = await s.check(ctx).catch((e) => e.message);
    if (!checkOnly) done.push(s);
    log.push({ id: s.id, ok: !why, reason: why || '', rollback: s.rollback });
    if (why) {
      ctx.say('FAIL ' + s.id + ': ' + why);
      if (done.length) {
        ctx.say('rollback, newest first:');
        for (const d of done.slice().reverse()) ctx.say('  ' + d.rollback + (d.rollbackNote ? '   # ' + d.rollbackNote : ''));
      }
      return { ok: false, step: s.id, reason: why, steps: log, notes: ctx.notes };
    }
    ctx.say('PASS ' + s.id);
    ctx.say('  rollback: ' + s.rollback + (s.rollbackNote ? '   # ' + s.rollbackNote : ''));
  }
  return { ok: true, steps: log, notes: ctx.notes };
}
