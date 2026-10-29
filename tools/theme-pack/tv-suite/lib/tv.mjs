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

// A luna-send answer: one JSON document, on one line or pretty-printed over several (systemUIManager and
// webappmanager answer that way), taken from the first `{` to the last `}` of the CR-stripped output.
export function parseAnswer(uri, stdout, stderr = '') {
  const text = String(stdout).replace(/\r/g, '');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(uri + ': no answer' + (String(stderr).trim() ? ' (' + String(stderr).trim().split('\n').pop() + ')' : ''));
  const doc = text.slice(a, b + 1);
  try { return JSON.parse(doc); } catch (e) { throw new Error(uri + ': unreadable answer (' + e.message.replace(/\s+/g, ' ') + '): ' + doc.replace(/\s+/g, ' ').slice(0, 200)); }
}

// `exec` runs ssh and scp; a test gives the fake TV's in-process one (fake/tv.mjs inProcess).
export function makeTv({ host = process.env.TV_HOST, log = () => {}, python = process.env.TV_PYTHON || 'python', exec = run } = {}) {
  if (!host) throw new Error('set TV_HOST to the TV address');
  const user = process.env.TV_ROOT_USER || 'root';
  // One connection for the whole run: a key press then costs a round trip, not a handshake.
  const control = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=' + path.join(os.tmpdir(), 'tv-suite-%r@%h-%p'),
    '-o', 'ControlPersist=120', '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
  const target = user + '@' + host;

  // `fresh` skips the shared connection: across a reboot its socket is stale.
  // After abort() every call fails: an interrupted command's own steps stop, and only the restore (on a fresh
  // instance) talks to the TV.
  let aborted = false;
  function abort() { aborted = true; }
  async function sh(command, { input, tty = false, timeout, fresh = false } = {}) {
    if (aborted) throw new Error('interrupted: this command no longer talks to the TV');
    const opts = fresh ? ['-o', 'ControlMaster=no', '-o', 'ControlPath=none', '-o', 'ConnectTimeout=5', '-o', 'BatchMode=yes'] : control;
    const r = await exec('ssh', [...opts, ...(tty ? ['-tt'] : []), target, command], { input, timeout });
    log('ssh', command, r.status);
    return r;
  }
  // luna-send prints nothing without a terminal over ssh, hence -tt; its stdout then has CRs.
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
  // LG's network input service is started on demand: its key socket exists only once someone has asked for it. Asked
  // for at the start of every command that presses keys and after every reboot or compositor restart (resetKeys),
  // then checked before the first key.
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
    // The service may have gone (a restart in between): ask for the socket again, once.
    if (r.status !== 0 && /No such file|Connection refused|socket/i.test(r.stderr + r.stdout)) { await ensureKeys(); r = await send(); }
    if (r.status !== 0) throw new Error('keys ' + names.join(' ') + ': ' + ((r.stderr + r.stdout).trim().split('\n').pop() || 'exit ' + r.status));
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
  // The parts' probes with their age by the service's own clock: { states, meta: { name: { at, layer, seq, age } },
  // now }. Ages are seconds; a part whose probe stopped being refreshed has a growing age.
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
  // The Look service's probing (test instrumentation, off on the household's TV): on for `seconds`, kept alive by
  // every getProbe and by calling this again; off at the end of every command.
  async function setProbing(on, seconds = 600) {
    const a = await luna(svc + '/setProbing', on ? { on: true, seconds } : { on: false });
    if (a.returnValue === false) throw new Error('setProbing: ' + (a.errorText || JSON.stringify(a)));
    return a;
  }
  async function probes() { return (await probeRead()).states; }
  // Closes the shared connection (before a reboot).
  async function disconnect() { await exec('ssh', [...control, '-O', 'exit', target], { timeout: 10000 }); }
  // The TV's clock and its uptime, read together: { now (epoch s), up (s since boot) }, or null when it is down.
  async function clock() {
    const r = await sh('date -u +%s; cut -d" " -f1 /proc/uptime', { fresh: true, timeout: 15000 });
    const [now, up] = r.stdout.trim().split(/\s+/).map(Number);
    return r.status === 0 && now > 0 && up >= 0 ? { now, up } : null;
  }
  return { host, target, sh, luna, pull, keys, ensureKeys, resetKeys, capture, now, reports, probes, probeRead, setProbing, disconnect, clock, abort };
}
