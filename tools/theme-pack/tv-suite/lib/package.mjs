import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');

export const dirs = (id) => ['usr/palm/applications/' + id, 'usr/palm/services/' + id + '.service', 'usr/palm/packages/' + id];

export function digest(entries) {
  const lines = entries.slice().sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((e) => e.md5 + '  ' + e.path + '\n');
  return md5(lines.join(''));
}
const counted = (p) => !/\.service\/data(\/|$)/.test(p);

export function hashIpk(file) {
  const buf = fs.readFileSync(file);
  let at = 8, data = null;
  while (at + 60 <= buf.length) {
    const name = buf.toString('latin1', at, at + 16).trim().replace(/\/$/, '');
    const size = Number(buf.toString('latin1', at + 48, at + 58).trim());
    if (name === 'data.tar.gz') data = buf.subarray(at + 60, at + 60 + size);
    at += 60 + size + (size % 2);
  }
  if (!data) throw new Error(file + ': no data.tar.gz');
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-suite-ipk-'));
  try {
    fs.writeFileSync(path.join(t, 'data.tar.gz'), data);
    fs.mkdirSync(path.join(t, 'x'));
    const r = spawnSync('tar', ['-C', path.join(t, 'x'), '-xzf', path.join(t, 'data.tar.gz')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('tar: ' + r.stderr);
    const entries = [];
    (function walk(d, rel) {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f), q = rel ? rel + '/' + f : f;
        const st = fs.lstatSync(p);
        if (st.isDirectory()) walk(p, q);
        else if (st.isFile() && counted(q)) entries.push({ path: q, md5: md5(fs.readFileSync(p)) });
      }
    })(path.join(t, 'x'), '');
    return digest(entries);
  } finally { fs.rmSync(t, { recursive: true, force: true }); }
}

export function tvHashScript(id) {
  return '# tv-suite: package hash\ncd /media/developer/apps 2>/dev/null && [ -d ' + dirs(id)[0] + ' ] && ' +
    'find ' + dirs(id).join(' ') + ' -type f 2>/dev/null | grep -v "\\.service/data/" | sort | xargs md5sum | md5sum | cut -d" " -f1';
}
