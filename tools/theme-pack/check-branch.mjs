// The checks a branch must pass before it merges into main, one PASS/FAIL line each. Exits non-zero on any FAIL.
//
//   node check-branch.mjs [BRANCH_OR_WORKTREE_PATH] [--base main] [--render]
//
// The target defaults to the current directory. A branch name is looked up among the repo's worktrees, since the
// tests and the render run in a checkout of it. --render also runs preview/render.mjs into a temp dir (needs Qt 5's
// qml and Xvfb, see the README). Extra portability patterns, one regex per line, come from the CHECK_BRANCH_PATTERNS
// env var (newline separated) and from .check-branch.local next to this file (gitignored; see the .example).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TRAILERS = [/^\s*co-authored-by:/im, /generated with/i, /\u{1F916}/u];

// Private addresses (RFC 1918) and the home directories of a person.
export const PORTABILITY = [
  { name: 'private IPv4', re: /(?<![\d.])(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?![\d.])/ },
  { name: 'home path', re: /(?:^|[^\w.-])\/(?:home|Users)\/(?!<)[\w.-]+\// },
];

export function findTrailer(message) {
  return TRAILERS.find((re) => re.test(message)) ? message.split('\n').find((l) => TRAILERS.some((re) => re.test(l))).trim() : null;
}

export function isCoreFile(file) { return /^core(\.\d+)?$/.test(file.split('/').pop()); }

// Patterns from one-per-line text; blank lines and #comments are skipped.
export function parsePatterns(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => ({ name: 'local pattern', re: new RegExp(l) }));
}

export function findPrivate(line, patterns = PORTABILITY) {
  const hit = patterns.find((p) => p.re.test(line));
  return hit ? hit.name : null;
}

// Why a failed render run failed, from its exit status and output. render.mjs prints "N failed:" and then each failing
// shot with its QML errors; anything else (a crash, a signal, a Node trace) is shown as the tail of what it printed. The
// progress counter ("12/560", redrawn with \r) is never the cause, so it is dropped.
export function renderFailureNote(r, maxLines = 12) {
  const text = [r.stdout, r.stderr].map((t) => String(t || '')).join('\n');
  const lines = text.split(/[\r\n]+/).filter((l) => l.trim() && !/^\d+\/\d+$/.test(l.trim()));
  const at = lines.findIndex((l) => /^\d+ failed:$/.test(l));
  let why = at >= 0 ? lines.slice(at) : lines.slice(-maxLines);
  if (why.length > maxLines) why = why.slice(0, maxLines).concat('... (' + (why.length - maxLines) + ' more lines; see the contact sheet)');
  const how = r.signal ? 'killed by ' + r.signal : r.error ? String(r.error.message || r.error) : 'exit ' + r.status;
  return how + (why.length ? ':\n    ' + why.join('\n    ') : ' with no output');
}

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (r.stderr || '').trim());
  return r.stdout;
}

// Where a branch is checked out: the worktree whose branch it is.
function worktreeOf(target) {
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) return path.resolve(target);
  const list = git('.', 'worktree', 'list', '--porcelain').split('\n\n');
  for (const w of list) {
    if (w.includes('branch refs/heads/' + target + '\n') || w.trim().endsWith('branch refs/heads/' + target)) return w.match(/^worktree (.+)$/m)[1];
  }
  throw new Error('no worktree or checked-out branch named ' + target);
}

function checks(cwd, base, render) {
  const range = base + '..HEAD';
  const results = [];
  const add = (name, fn) => {
    try { const [ok, note] = fn(); results.push({ name, ok, note }); }
    catch (e) { results.push({ name, ok: false, note: e.message.split('\n')[0] }); }
  };
  const short = (s, n = 5) => { const a = s.filter(Boolean); return a.slice(0, n).join('; ') + (a.length > n ? '; +' + (a.length - n) + ' more' : ''); };

  add('on top of ' + base, () => {
    const ok = spawnSync('git', ['merge-base', '--is-ancestor', base, 'HEAD'], { cwd }).status === 0;
    return [ok, ok ? git(cwd, 'rev-list', '--count', range).trim() + ' commit(s) ahead' : base + ' is not an ancestor of HEAD, rebase onto it'];
  });

  add('no attribution trailers', () => {
    const bad = git(cwd, 'log', '--format=%h%x00%B%x01', range).split('\x01').map((c) => c.trim()).filter(Boolean)
      .map((c) => { const [h, msg] = c.split('\x00'); const t = findTrailer(msg || ''); return t && h + ' "' + t + '"'; }).filter(Boolean);
    return [!bad.length, bad.length ? short(bad) : 'none in ' + git(cwd, 'rev-list', '--count', range).trim() + ' commit(s)'];
  });

  add('no core dumps', () => {
    const added = git(cwd, 'diff', '--name-only', '--diff-filter=AR', range).split('\n').filter(isCoreFile);
    const loose = git(cwd, 'ls-files', '--others').split('\n').filter(isCoreFile);
    const bad = added.map((f) => 'added ' + f).concat(loose.map((f) => 'untracked ' + f));
    return [!bad.length, bad.length ? short(bad) : 'none added or untracked'];
  });

  add('portability', () => {
    const patterns = PORTABILITY.concat(parsePatterns(process.env.CHECK_BRANCH_PATTERNS));
    const local = path.join(here, '.check-branch.local');
    if (fs.existsSync(local)) patterns.push(...parsePatterns(fs.readFileSync(local, 'utf8')));
    const bad = [];
    let file = '', n = 0;
    for (const l of git(cwd, 'diff', '-U0', '--no-color', range).split('\n')) {
      if (l.startsWith('+++ ')) { file = l.slice(6); continue; }
      const h = l.match(/^@@ .*\+(\d+)/);
      if (h) { n = Number(h[1]); continue; }
      if (l.startsWith('+')) { const name = findPrivate(l.slice(1), patterns); if (name) bad.push(file + ':' + n + ' ' + name); n++; }
    }
    return [!bad.length, bad.length ? short(bad) : 'no private address or home path in added lines (' + patterns.length + ' patterns)'];
  });

  add('node --test', () => {
    const files = fs.readdirSync(path.join(cwd, 'tools/theme-pack/test')).filter((f) => f.endsWith('.test.js')).map((f) => 'tools/theme-pack/test/' + f);
    const r = spawnSync(process.execPath, ['--test', ...files], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
    const out = r.stdout || '';
    const num = (k) => (out.match(new RegExp('^# ' + k + ' (\\d+)', 'm')) || [])[1] || '?';
    return [r.status === 0, num('pass') + ' passed, ' + num('fail') + ' failed, ' + num('skipped') + ' skipped'];
  });

  if (render) add('render', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-branch-'));
    const r = spawnSync(process.execPath, [path.join(cwd, 'tools/theme-pack/preview/render.mjs'), dir], { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
    const sheet = path.join(dir, 'index.html');
    if (r.status === 0) return [true, '0 failed shots; contact sheet ' + sheet];
    return [false, renderFailureNote(r) + '\n    contact sheet ' + sheet];
  });

  return results;
}

function main(argv) {
  let target = '.', base = 'main', render = false, seen = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') base = argv[++i];
    else if (argv[i] === '--render') render = true;
    else if (argv[i].startsWith('--')) { console.error('unknown option ' + argv[i]); process.exit(2); }
    else if (!seen) { target = argv[i]; seen = true; }
  }
  let cwd;
  try { cwd = worktreeOf(target); } catch (e) { console.error(e.message); process.exit(2); }
  const results = checks(cwd, base, render);
  for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name + ': ' + r.note);
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed ? failed + ' check(s) failed: do not merge' : 'all ' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
