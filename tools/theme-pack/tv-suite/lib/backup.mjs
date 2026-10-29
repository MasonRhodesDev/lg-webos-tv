// What deploy replaces, kept on the TV before the first deploy changes anything: the boot hook, the old patched
// Settings ($root/settings), our layer and stub dirs, whether something was mounted over LG's Settings, and whether
// the Look package was installed. One backup, made once: a later deploy keeps the first (the TV as it was before the
// suite). `rollback` puts exactly that back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCmd } from './tv.mjs';

const THEME = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ROOT = '/media/developer/themepack';
export const BACKUP = '/media/developer/themepack-backup';
export const HOOK = '/var/lib/webosbrew/init.d/60-themepack';
const APP = JSON.parse(fs.readFileSync(path.join(THEME, 'tv', 'appinfo.json'), 'utf8'));
const SETTINGS_APP = '/usr/palm/applications/com.palm.app.settings';

// Runs on the TV. Prints the manifest; makes the backup only if there is none.
export const BACKUP_SCRIPT = `# tv-suite: backup
B=${BACKUP}
if [ -f $B/manifest.json ]; then echo "backup kept from before"; cat $B/manifest.json; exit 0; fi
rm -rf $B.new && mkdir -p $B.new || exit 1
h=false; if [ -f ${HOOK} ]; then cp -a ${HOOK} $B.new/60-themepack || exit 1; h=true; fi
s=false; if [ -d ${ROOT}/settings ]; then cp -a ${ROOT}/settings $B.new/settings || exit 1; s=true; fi
l=false; if [ -d ${ROOT}/layer ]; then cp -a ${ROOT}/layer $B.new/layer || exit 1; l=true; fi
t=false; if [ -d ${ROOT}/settings-stub ]; then cp -a ${ROOT}/settings-stub $B.new/settings-stub || exit 1; t=true; fi
m=false; mount | grep -q " ${SETTINGS_APP} " && m=true
a=false; [ -d /media/developer/apps/usr/palm/applications/${APP.id} ] && a=true
o=false; grep -q "theme-pack boot hook" ${HOOK} 2>/dev/null && o=true
printf '{"created":"%s","hook":%s,"ourHook":%s,"settings":%s,"layer":%s,"stub":%s,"settingsMounted":%s,"lookInstalled":%s}\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" $h $o $s $l $t $m $a > $B.new/manifest.json
mv $B.new $B && echo "backup made" && cat $B/manifest.json`;

export async function backup(ctx) {
  const r = await ctx.tv.sh(BACKUP_SCRIPT, { timeout: 300000 });
  const line = r.stdout.split('\n').find((l) => l.trim().startsWith('{'));
  let m = null;
  try { m = JSON.parse(line); } catch (e) { /* no manifest */ }
  for (const l of r.stdout.trim().split('\n')) ctx.say('  | ' + l);
  return r.status === 0 && m ? { manifest: m, made: /backup made/.test(r.stdout) } : { error: (r.stderr || r.stdout).trim() || 'exit ' + r.status };
}

// The rollback, as steps: [title, command for a person, run(ctx) -> why it failed or '']. `--print` shows the commands.
export function rollbackSteps() {
  const ssh = (c) => 'ssh root@$TV_HOST ' + JSON.stringify(c);
  const remote = (ctx, c, opts) => ctx.tv.sh(c, opts);
  const script = (ctx, file, args) => spawnCmd('sh', [path.join(THEME, file), ...args], { env: Object.assign({}, process.env, { TV_HOST: ctx.tv.host }), timeout: 15 * 60000 });
  let manifest = null;
  return [
    ['read the backup manifest', ssh('cat ' + BACKUP + '/manifest.json'), async (ctx) => {
      const r = await remote(ctx, 'cat ' + BACKUP + '/manifest.json');
      try { manifest = JSON.parse(r.stdout); } catch (e) { return 'no backup on the TV (' + BACKUP + '): deploy makes one; nothing was rolled back'; }
      ctx.say('  ' + JSON.stringify(manifest));
      return '';
    }],
    ['take the stub off LG\'s Settings', ssh('sh -s') + ' < tools/theme-pack/webos/settings-unmount.sh', async (ctx) => {
      const r = await remote(ctx, 'sh -s', { input: fs.readFileSync(path.join(THEME, 'webos', 'settings-unmount.sh')) });
      return r.status === 0 ? '' : 'Settings is still mounted: ' + r.stdout.trim();
    }],
    ['the compositor back on stock', 'TV_HOST=$TV_HOST sh tools/theme-pack/webos/own-layer-tv.sh revert', async (ctx) => {
      const r = await script(ctx, 'webos/own-layer-tv.sh', ['revert']);
      ctx.tv.resetKeys();
      return r.status === 0 ? '' : 'own-layer-tv.sh revert failed: ' + (r.stdout + r.stderr).trim().split('\n').pop();
    }],
    ['put back the hook, the old Settings, the layer and stub dirs as they were', ssh('# tv-suite: restore backup ...'), async (ctx) => {
      const back = (k, from, to) => manifest[k] ? 'rm -rf ' + to + ' && cp -a ' + BACKUP + '/' + from + ' ' + to : 'rm -rf ' + to;
      const c = ['# tv-suite: restore backup', back('hook', '60-themepack', HOOK), back('settings', 'settings', ROOT + '/settings'),
        back('layer', 'layer', ROOT + '/layer'), back('stub', 'settings-stub', ROOT + '/settings-stub'), 'echo restored'].join(' && ');
      const r = await remote(ctx, c);
      return /restored/.test(r.stdout) ? '' : 'restoring the files failed: ' + (r.stderr || r.stdout).trim();
    }],
    ['remove the Look package if it was not there before (appInstallService dev/remove, in the TV\'s schema list)',
      ssh("luna-send -n 1 -w 60000 luna://com.webos.appInstallService/dev/remove '{\"id\":\"" + APP.id + "\"}'"), async (ctx) => {
        if (manifest.lookInstalled) { ctx.say('  it was installed before the suite: left installed'); return ''; }
        await ctx.tv.luna('luna://com.webos.appInstallService/dev/remove', { id: APP.id }, { wait: 60000 }).catch(() => null);
        const a = await ctx.tv.luna('luna://com.webos.applicationManager/getAppInfo', { id: APP.id }).catch(() => ({ returnValue: false }));
        return a.returnValue === false ? '' : 'the Look package is still installed (getAppInfo answers)';
      }],
    ['run the old boot hook, as a boot would (it puts back what it mounted)', ssh(HOOK), async (ctx) => {
      if (!manifest.hook) return '';
      await remote(ctx, HOOK + '; tail -8 /tmp/themepack.log', { timeout: 300000 });
      ctx.tv.resetKeys();
      const m = (await remote(ctx, 'mount')).stdout.includes(' ' + SETTINGS_APP + ' ');
      return m === manifest.settingsMounted ? '' : 'after the old hook, LG\'s Settings is ' + (m ? '' : 'not ') + 'mounted over; before the suite it was ' + (manifest.settingsMounted ? '' : 'not ');
    }],
    ['check the files match the backup', ssh('cmp ' + BACKUP + '/60-themepack ' + HOOK), async (ctx) => {
      const c = ['# tv-suite: verify backup',
        manifest.hook ? 'cmp -s ' + BACKUP + '/60-themepack ' + HOOK + ' || echo "hook differs"' : '[ ! -e ' + HOOK + ' ] || echo "hook should be absent"',
        manifest.settings ? 'diff -r ' + BACKUP + '/settings ' + ROOT + '/settings >/dev/null || echo "settings differ"' : '[ ! -e ' + ROOT + '/settings ] || echo "settings should be absent"',
        'echo checked'].join('; ');
      const r = await remote(ctx, c);
      const bad = r.stdout.split('\n').filter((l) => /differ|absent/.test(l));
      return /checked/.test(r.stdout) && !bad.length ? '' : bad.join('; ') || 'not checked';
    }]
  ];
}

export async function rollback(ctx) {
  const steps = rollbackSteps();
  for (const [title, , run] of steps) {
    ctx.say('== ' + title);
    const why = await run(ctx).catch((e) => e.message);
    if (why) { ctx.say('FAIL ' + title + ': ' + why); return { ok: false, step: title, reason: why }; }
    ctx.say('PASS ' + title);
  }
  ctx.say('rolled back; the backup stays at ' + BACKUP + ' (remove it by hand once you are sure)');
  return { ok: true };
}

export function printRollback(say) {
  say('Rollback, in order (TV_HOST is the TV; `tv-suite.mjs rollback --live` runs and checks these):');
  for (const [title, cmd] of rollbackSteps()) say('  # ' + title + '\n  ' + cmd);
}
