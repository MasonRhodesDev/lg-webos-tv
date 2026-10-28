// The journal: what the TV must be put back to, written before the suite changes anything, so an interrupted or
// killed command can be undone. It lives in the command's OUT dir, and a pointer per TV host in the suite's state dir
// ($TV_SUITE_STATE, default $XDG_STATE_HOME/tv-suite or ~/.local/state/tv-suite) lets the next command find it. A
// command that finds an unresolved journal restores from it first and takes no new baseline until that is verified.
// The PIN is never in it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function stateDir() {
  return process.env.TV_SUITE_STATE || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'tv-suite');
}
const pointer = (host) => path.join(stateDir(), String(host).replace(/[^\w.-]/g, '_') + '.json');

// The journal file the host's pointer names, if it is still there.
export function pending(host) {
  try {
    const p = JSON.parse(fs.readFileSync(pointer(host), 'utf8'));
    return fs.existsSync(p.journal) ? JSON.parse(fs.readFileSync(p.journal, 'utf8')) : null;
  } catch (e) { return null; }
}

function write(j) {
  fs.mkdirSync(path.dirname(j.file), { recursive: true });
  fs.writeFileSync(j.file + '.new', JSON.stringify(j, null, 1));
  fs.renameSync(j.file + '.new', j.file);
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(pointer(j.host), JSON.stringify({ journal: j.file, at: new Date().toISOString() }));
}

// Starts a journal with the baseline (the TV as found). There is one per host at a time.
export function open(host, out, baseline) {
  if (pending(host)) throw new Error('a journal for ' + host + ' is still open; it must be restored first');
  const j = { host, file: path.join(path.resolve(out), 'journal.json'), started: new Date().toISOString(), baseline, layer: null, stub: null };
  write(j);
  return j;
}

// Records a change before it is made: { layer: 'broken' } or { stub: 'removed' }.
export function mark(j, patch) { Object.assign(j, patch); write(j); }

export function close(j) {
  try { fs.unlinkSync(j.file); } catch (e) { /* gone already */ }
  try { fs.unlinkSync(pointer(j.host)); } catch (e) { /* gone already */ }
}
