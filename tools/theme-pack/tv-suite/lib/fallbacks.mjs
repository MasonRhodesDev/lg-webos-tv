// The fallbacks, driven on purpose: our layer deployed broken (Layer.qml does not load) or without our Settings part,
// then the good build put back and checked. A broken build is a copy of webos/ and ui/ in a temp dir with one change
// carrying a marker comment, applied with that copy's own-layer-tv.sh, so the repo is never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { THEME } from './deploy.mjs';
import { spawnCmd } from './tv.mjs';

export const MARK = { layer: 'tv-suite: broken on purpose (layer)', part: 'tv-suite: broken on purpose (no Settings part)' };
const SETTINGS_APP = '/usr/palm/applications/com.palm.app.settings';
const HOOK = '/var/lib/webosbrew/init.d/60-themepack';

function brokenCopy(kind) {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-broken-'));
  fs.cpSync(path.join(THEME, 'webos'), path.join(t, 'webos'), { recursive: true });
  fs.cpSync(path.join(THEME, 'ui'), path.join(t, 'ui'), { recursive: true });
  const f = path.join(t, 'ui', 'Look', 'Layer.qml');
  let src = fs.readFileSync(f, 'utf8');
  if (kind === 'layer') src += '\n}}} // ' + MARK.layer + '\n';
  else {
    const before = src;
    src = src.replace(/,\s*"parts\/Settings\.qml"/, '').replace(/property var parts: \[/, '// ' + MARK.part + '\n    property var parts: [');
    if (src === before || /"parts\/Settings\.qml"/.test(src)) throw new Error('Layer.qml no longer lists parts/Settings.qml as expected; cannot build the fallback');
  }
  fs.writeFileSync(f, src);
  return t;
}

async function sh(ctx, file, args, cwdTheme = THEME) {
  const shown = cwdTheme === THEME ? 'tools/theme-pack/' + file : path.join(cwdTheme, file) + ' (a broken copy)';
  ctx.say('$ TV_HOST=$TV_HOST sh ' + shown + ' ' + args.join(' '));
  const r = await spawnCmd('sh', [path.join(cwdTheme, file), ...args], { env: Object.assign({}, process.env, { TV_HOST: ctx.tv.host }), timeout: 15 * 60000 });
  const out = (r.stdout + r.stderr).replace(/\r/g, '');
  for (const l of out.split('\n').filter(Boolean)) ctx.say('  | ' + l);
  return { status: r.status, out };
}

// Applies a broken build. `kind` is "layer" or "part".
export async function breakLayer(ctx, kind) {
  const t = brokenCopy(kind);
  const t0 = await ctx.tv.now();
  const r = await sh(ctx, 'webos/own-layer-tv.sh', ['apply'], t);
  fs.rmSync(t, { recursive: true, force: true });
  return { t0, out: r.out };
}

// Takes the stub off, so the hook decides again; runs the hook, returns its last lines.
export async function rerunHook(ctx, { unmount = true } = {}) {
  if (unmount) await ctx.tv.sh('sh -s', { input: fs.readFileSync(path.join(THEME, 'webos', 'settings-unmount.sh')) });
  const r = await ctx.tv.sh(HOOK + '; tail -8 /tmp/themepack.log', { timeout: 300000 });
  const at = r.stdout.lastIndexOf('\n=== ');
  return at >= 0 ? r.stdout.slice(at + 1) : r.stdout;
}

export async function mounted(ctx) { return (await ctx.tv.sh('mount')).stdout.includes(' ' + SETTINGS_APP + ' '); }

// The good build back: the layer from this checkout, then the hook (which mounts the stub once the host is ready).
export async function restoreLayer(ctx) {
  const t0 = await ctx.tv.now();
  const a = await sh(ctx, 'webos/own-layer-tv.sh', ['apply']);
  const b = await sh(ctx, 'webos/install-boot.sh', ['install']);
  const ready = (await ctx.tv.reports(t0)).some((x) => x.text === 'settings: host ready');
  const ok = ready && await mounted(ctx);
  ctx.check('the good layer is back: host ready and the stub mounted', ok, ok ? '' : (a.status || b.status) ? 'a script failed' : ready ? 'not mounted' : 'no "settings: host ready"');
  return ok;
}

export async function removeStub(ctx) { return sh(ctx, 'webos/install-boot.sh', ['remove']); }
export async function installStub(ctx) { return sh(ctx, 'webos/install-boot.sh', ['install']); }
