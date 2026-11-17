import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function stateDir() {
  return process.env.TV_SUITE_STATE || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'tv-suite');
}
const pointer = (host) => path.join(stateDir(), String(host).replace(/[^\w.-]/g, '_') + '.json');

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

export function open(host, out, baseline) {
  if (pending(host)) throw new Error('a journal for ' + host + ' is still open; it must be restored first');
  const j = { host, file: path.join(path.resolve(out), 'journal.json'), started: new Date().toISOString(), baseline, layer: null, stub: null };
  write(j);
  return j;
}

export function mark(j, patch) { Object.assign(j, patch); write(j); }

export function close(j) {
  try { fs.unlinkSync(j.file); } catch (e) { }
  try { fs.unlinkSync(pointer(j.host)); } catch (e) { }
}
