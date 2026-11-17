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

export function parseAnswer(uri, stdout, stderr = '') {
  const text = String(stdout).replace(/\r/g, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(uri + ': no answer' + (String(stderr).trim() ? ' (' + String(stderr).trim().split('\n').pop() + ')' : ''));
  const doc = text.slice(a, b + 1);
  try { return JSON.parse(doc); } catch (e) { throw new Error(uri + ': unreadable answer (' + e.message.replace(/\s+/g, ' ') + '): ' + doc.replace(/\s+/g, ' ').slice(0, 200)); }
}

export function makeTv({ host = process.env.TV_HOST, log = () => {}, python = process.env.TV_PYTHON || 'python', exec = run } = {}) {
  if (!host) throw new Error('set TV_HOST to the TV address');
  const user = process.env.TV_ROOT_USER || 'root';
  const control = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=' + path.join(os.tmpdir(), 'tv-suite-%r@%h-%p'),
    '-o', 'ControlPersist=120', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
  const target = user + '@' + host;

  let aborted = false;
  function abort() { aborted = true; }
  async function sh(command, { input, tty = false, timeout, fresh = false } = {}) {
    if (aborted) throw new Error('interrupted: this command no longer talks to the TV');
    const opts = fresh ? ['-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes'] : control;
    const r = await exec('ssh', [...opts, ...(tty ? ['-tt'] : []), target, command], { input, timeout });
    log('ssh', command, r.status);
    return r;
  }
  async function luna(uri, payload = {}, { wait = 5000 } = {}) {
    const r = await sh('luna-send -n 1 -w ' + wait + ' ' + uri + ' ' + quote(JSON.stringify(payload)) + ' 2>/dev/null', { tty: true, timeout: wait + 15000 });
    return parseAnswer(uri, r.stdout, r.stderr);
  }
  async function pull(remote, local) {
    if (aborted) throw new Error('interrupted: this command no longer talks to the TV');
    const r = await exec('scp', ['-q', ...control, target + ':' + remote, local]);
    log('scp', remote + ' -> ' + local, r.status);
    if (r.status !== 0) throw new Error('scp ' + remote + ': ' + r.stderr.trim());
  }
  const SOCK = '/tmp/netinput.pointer.sock';
  let keysReady = false;
  async function ensureKeys() {
    let a;
    try { a = await luna('luna://com.webos.service.networkinput/getPointerInputSocket', {}); } catch (e) { a = { returnValue: false, errorText: e.message }; }
    const sock = a.socketPath || SOCK;
    const r = await sh('[ -S ' + sock + ' ]');
    if (r.status !== 0) throw new Error('the key socket ' + sock + ' is missing after getPointerInputSocket (' + JSON.stringify(a).slice(0, 200) + '): no key can be pressed');
    keysReady = true;
  }
  function resetKeys() { keysReady = false; }
  async function keys(names) {
    if (!keysReady) await ensureKeys();
    const send = () => sh(python + ' - ' + names.join(' '), { input: fs.readFileSync(KEYS_PY), timeout: 15000 + names.length * 1000 });
    let r = await send();
    if (r.status !== 0 && /No such file|Connection refused|socket/i.test(r.stderr + r.stdout)) { await ensureKeys(); r = await send(); }
    if (r.status !== 0) throw new Error('keys ' + names.join(' ') + ': ' + ((r.stderr + r.stdout).trim().split('\n').pop() || 'exit ' + r.status));
  }
  async function capture(local) {
    const remote = '/tmp/tv-suite-capture.png';
    await sh('rm -f ' + remote);
    const a = await luna('luna://com.webos.surfacemanager/captureCompositorOutput', { output: remote, format: 'PNG' });
    if (a.returnValue === false) throw new Error('capture: ' + (a.errorText || JSON.stringify(a)));
    await pull(remote, local);
  }
  async function now() {
    const r = await sh('date -u +%Y-%m-%dT%H:%M:%S');
    return r.stdout.trim();
  }
  const svc = 'luna://dev.themepack.look.service';
  async function reports(since = '') {
    const a = await luna(svc + '/getReports');
    return (a.reports || []).filter((r) => r.at > since);
  }
  async function probeRead() {
    const a = await luna(svc + '/getProbe');
    const now = a.now || '', t = Date.parse(now);
    const states = {}, meta = {};
    for (const [k, v] of Object.entries(a.probes || {})) {
      const name = k.replace(/^.*\//, '').replace(/\.qml$/, '');
      states[name] = v.state;
      meta[name] = { at: v.at, layer: v.layer || '', seq: v.seq || 0, age: isFinite(t) && v.at ? (t - Date.parse(v.at)) / 1000 : Infinity };
    }
    return { states, meta, now, probing: a.probing === true };
  }
  async function setProbing(on, seconds = 600) {
    const a = await luna(svc + '/setProbing', on ? { on: true, seconds } : { on: false });
    if (a.returnValue === false) throw new Error('setProbing: ' + (a.errorText || JSON.stringify(a)));
    return a;
  }
  async function probes() { return (await probeRead()).states; }
  async function disconnect() { await exec('ssh', [...control, '-O', 'exit', target], { timeout: 10000 }); }
  async function clock() {
    const r = await sh('date -u +%s; cut -d" " -f1 /proc/uptime', { fresh: true, timeout: 15000 });
    const [now, up] = r.stdout.trim().split(/\s+/).map(Number);
    return r.status === 0 && now > 0 && up >= 0 ? { now, up } : null;
  }
  return { host, target, sh, luna, pull, keys, ensureKeys, resetKeys, capture, now, reports, probes, probeRead, setProbing, disconnect, clock, abort };
}
