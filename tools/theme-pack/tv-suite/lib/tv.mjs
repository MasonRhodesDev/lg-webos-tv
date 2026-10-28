// The one seam between the suite and the TV: ssh and scp by name (so a dry run puts a fake TV first on PATH), as root
// on $TV_HOST. Every call is logged.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const KEYS_PY = path.join(here, '..', 'keys.py');

export const quote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

function run(cmd, args, { input, env, timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: env || process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', done = false;
    const t = setTimeout(() => { if (!done) { stderr += '\n(timed out after ' + timeout + ' ms)'; p.kill('SIGKILL'); } }, timeout);
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('error', (e) => { stderr += e.message; });
    p.on('close', (status) => { done = true; clearTimeout(t); resolve({ status: status === null ? -1 : status, stdout, stderr }); });
    p.stdin.on('error', () => {});
    p.stdin.end(input === undefined ? '' : input);
  });
}
export { run as spawnCmd };

// `exec` runs ssh and scp; a test gives the fake TV's in-process one (fake/tv.mjs inProcess).
export function makeTv({ host = process.env.TV_HOST, log = () => {}, python = process.env.TV_PYTHON || 'python', exec = run } = {}) {
  if (!host) throw new Error('set TV_HOST to the TV address');
  const user = process.env.TV_ROOT_USER || 'root';
  // One connection for the whole run: a key press then costs a round trip, not a handshake.
  const control = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=' + path.join(os.tmpdir(), 'tv-suite-%r@%h-%p'),
    '-o', 'ControlPersist=120', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
  const target = user + '@' + host;

  // `fresh` skips the shared connection: across a reboot its socket is stale.
  async function sh(command, { input, tty = false, timeout, fresh = false } = {}) {
    const opts = fresh ? ['-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes'] : control;
    const r = await exec('ssh', [...opts, ...(tty ? ['-tt'] : []), target, command], { input, timeout });
    log('ssh', command, r.status);
    return r;
  }
  // luna-send prints nothing without a terminal over ssh, hence -tt; its stdout then has CRs.
  async function luna(uri, payload = {}, { wait = 5000 } = {}) {
    const r = await sh('luna-send -n 1 -w ' + wait + ' ' + uri + ' ' + quote(JSON.stringify(payload)) + ' 2>/dev/null', { tty: true, timeout: wait + 15000 });
    const line = r.stdout.replace(/\r/g, '').split('\n').find((l) => l.trim().startsWith('{'));
    if (!line) throw new Error(uri + ': no answer' + (r.stderr.trim() ? ' (' + r.stderr.trim().split('\n').pop() + ')' : ''));
    try { return JSON.parse(line); } catch (e) { throw new Error(uri + ': unreadable answer ' + line.slice(0, 200)); }
  }
  async function pull(remote, local) {
    const r = await exec('scp', ['-q', ...control, target + ':' + remote, local]);
    log('scp', remote + ' -> ' + local, r.status);
    if (r.status !== 0) throw new Error('scp ' + remote + ': ' + r.stderr.trim());
  }
  async function keys(names) {
    const r = await sh(python + ' - ' + names.join(' '), { input: fs.readFileSync(KEYS_PY), timeout: 15000 + names.length * 1000 });
    if (r.status !== 0) throw new Error('keys ' + names.join(' ') + ': ' + (r.stderr.trim() || 'exit ' + r.status));
  }
  // The compositor's output: our layer and LG's UI, never the video (it shows black).
  async function capture(local) {
    const remote = '/tmp/tv-suite-capture.png';
    await sh('rm -f ' + remote);
    const a = await luna('luna://com.webos.surfacemanager/captureCompositorOutput', { output: remote, format: 'PNG' });
    if (a.returnValue === false) throw new Error('capture: ' + (a.errorText || JSON.stringify(a)));
    await pull(remote, local);
  }
  // The TV's clock, as the reports write it (UTC, ISO), so "since" compares as text on both sides.
  async function now() {
    const r = await sh('date -u +%Y-%m-%dT%H:%M:%S');
    return r.stdout.trim();
  }
  const svc = 'luna://dev.themepack.look.service';
  async function reports(since = '') {
    const a = await luna(svc + '/getReports');
    return (a.reports || []).filter((r) => r.at > since);
  }
  async function probes() {
    const a = await luna(svc + '/getProbe');
    const out = {};
    for (const [k, v] of Object.entries(a.probes || {})) out[k.replace(/^parts\//, '').replace(/\.qml$/, '')] = v.state;
    return out;
  }
  // Closes the shared connection (before a reboot).
  async function disconnect() { await exec('ssh', [...control, '-O', 'exit', target], { timeout: 10000 }); }
  // The TV's clock and its uptime, read together: { now (epoch s), up (s since boot) }, or null when it is down.
  async function clock() {
    const r = await sh('date -u +%s; cut -d" " -f1 /proc/uptime', { fresh: true, timeout: 15000 });
    const [now, up] = r.stdout.trim().split(/\s+/).map(Number);
    return r.status === 0 && now > 0 && up >= 0 ? { now, up } : null;
  }
  return { host, target, sh, luna, pull, keys, capture, now, reports, probes, disconnect, clock };
}
