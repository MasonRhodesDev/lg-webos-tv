// Renders every preview scene in every style, with no theme and with each theme alone, in each state the scene
// declares, and writes the PNGs and a contact sheet (index.html) into an output directory.
//
//   node preview/render.mjs [OUT_DIR] [--scene NAME]... [--jobs N]
//
// OUT_DIR defaults to a new directory under the OS temp dir. Needs Qt 5's `qml` with QtQuick and QtGraphicalEffects
// (QML_BIN, default `qml-qt5` or `qml` on PATH), Xvfb, and Mesa's software OpenGL: Qt's software backend draws no
// ShaderEffect, so theme glows only show under OpenGL. Each worker runs its own Xvfb. Exits non-zero if any shot
// fails, with its QML errors.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shotStates } from './states.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const packsDir = path.join(root, 'packs');

const argv = process.argv.slice(2);
let hangLimitMs = 300000;
let outDir = null, jobs = Math.max(1, Math.floor(os.cpus().length / 2));
const only = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--scene') only.push(argv[++i].replace(/\.qml$/, ''));
  else if (argv[i] === '--hang-limit') hangLimitMs = Math.max(1, Number(argv[++i]) || 1) * 1000;
  else if (argv[i] === '--jobs') jobs = Math.max(1, Number(argv[++i]) || 1);
  else if (argv[i].startsWith('--')) { console.error('unknown option ' + argv[i]); process.exit(2); }
  else outDir = path.resolve(argv[i]);
}
outDir = outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'theme-pack-preview-'));
fs.mkdirSync(outDir, { recursive: true });

// Looked up on PATH rather than run: `qml --help` with no display aborts and leaves a core file.
function onPath(name) {
  if (name.includes('/')) return fs.existsSync(name) ? name : null;
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(d, name);
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) { /* next */ }
  }
  return null;
}
const qml = process.env.QML_BIN ? onPath(process.env.QML_BIN) : onPath('qml-qt5') || onPath('qml');
const xvfb = onPath('Xvfb');
if (!qml) { console.error('no Qt 5 qml tool found: install it, or set QML_BIN to its path'); process.exit(2); }
if (!xvfb) { console.error('no Xvfb found: install it (the shots render through OpenGL on a virtual display)'); process.exit(2); }

const packs = (kind) => fs.readdirSync(path.join(packsDir, kind)).filter((f) => f.endsWith('.js')).sort()
  .map((f) => require(path.join(packsDir, kind, f)));
const styles = packs('styles'), themes = packs('themes');

// The Look service's answer, as service/service.js's payload() builds it.
function payload(style, active) {
  return {
    returnValue: true,
    look: { style: style.id, themes: active.map((t) => t.id) },
    subscribers: 0,
    picker: { open: false, at: 0 },
    settings: { open: false, target: '', at: 0 },
    assets: 'file://' + path.join(packsDir, 'assets') + '/',
    fonts: 'file://' + path.join(packsDir, 'fonts') + '/',
    style,
    themes: active,
    available: {
      styles: styles.map((s) => ({ id: s.id, name: s.name })),
      themes: themes.map((t) => ({ id: t.id, name: t.name, description: t.description || '' }))
    }
  };
}

const env = { ...process.env, QT_FORCE_STDERR_LOGGING: '1', LIBGL_ALWAYS_SOFTWARE: '1',
  QML2_IMPORT_PATH: path.join(here, 'mocks') + path.delimiter + path.join(root, 'ui') };
delete env.QT_QPA_PLATFORM;
delete env.QT_QUICK_BACKEND;

// A virtual display of our own; Xvfb picks a free number and writes it to -displayfd, so parallel workers can't race.
const servers = [];
const deadDisplays = [];
const running = new Set();
process.on('exit', () => { for (const x of servers) x.kill('SIGKILL'); for (const p of running) p.kill('SIGKILL'); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(128 + (os.constants.signals[sig] || 0)));
function startDisplay() {
  return new Promise((resolve, reject) => {
    const x = spawn(xvfb, ['-displayfd', '3', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'],
                    { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
    servers.push(x);
    let out = '', err = '';
    x.stderr.on('data', (d) => { err += d; });
    x.stdio[3].on('data', (d) => { out += d; if (/\n/.test(out)) resolve(':' + out.trim()); });
    x.on('error', (e) => reject(new Error('Xvfb could not start: ' + e.message)));
    x.on('exit', (code, signal) => {
      const why = 'Xvfb ' + (signal ? 'killed by ' + signal : 'exited ' + code) + (err.trim() ? ': ' + err.trim() : '');
      if (!out.includes('\n')) reject(new Error(why + ' before it reported a display'));
      else deadDisplays.push(':' + out.trim() + ' ' + why);
    });
  });
}

function run(args, display) {
  return new Promise((resolve) => {
    const p = spawn(qml, [path.join(here, 'Shot.qml'), '--', ...args], { env: { ...env, DISPLAY: display }, stdio: ['ignore', 'pipe', 'pipe'] });
    running.add(p);
    let log = '', timedOut = false;
    // Shot.qml gives up on its own well before this; this is for a qml that stops answering at all.
    const timer = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, hangLimitMs);
    p.stdout.on('data', (d) => { log += d; });
    p.stderr.on('data', (d) => { log += d; });
    p.on('close', (code, signal) => {
      clearTimeout(timer); running.delete(p);
      if (timedOut) log += '\nshot: qml stopped answering and was killed after ' + hangLimitMs / 1000 + ' s';
      else if (signal) log += '\nshot: qml was killed by ' + signal + (signal === 'SIGSEGV' || signal === 'SIGABRT' ? ' (crashed)' : '');
      resolve({ code: code === null ? -1 : code, log });
    });
    p.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, log: 'shot: could not run qml: ' + e.message }); });
  });
}

// What counts as a QML error in a run's log: QML warnings carry a file:line, Shot's own failures say "shot:", and the
// layer's reports of kind "error".
function errorsIn(log) {
  return log.split('\n').filter((l) => /\.(qml|js):\d+/.test(l) || /\bshot: /.test(l) ||
    /(TypeError|ReferenceError|SyntaxError|RangeError)/.test(l) || /"kind":"error"/.test(l));
}

const sceneDir = path.join(here, 'scenes');
const scenes = fs.readdirSync(sceneDir).filter((f) => f.endsWith('.qml')).map((f) => f.replace(/\.qml$/, ''))
  .filter((n) => !only.length || only.includes(n)).sort();
if (!scenes.length) { console.error('no scenes' + (only.length ? ' named ' + only.join(', ') : '')); process.exit(2); }

const failures = [];
const info = {};
const plain = JSON.stringify(payload(styles[0], []));
// A display that can't start is the one external nondeterminism here (Xvfb needs a free display number, a lock file and
// a socket); say so plainly and stop, rather than let the rejection surface as a Node trace.
function die(e) { console.error('render failed: ' + (e && e.message || e)); process.exit(1); }
const firstDisplay = await startDisplay().catch(die);
for (const s of scenes) {
  const r = await run([path.join(sceneDir, s + '.qml'), plain, '--states'], firstDisplay);
  const m = /SHOT-INFO (.*)/.exec(r.log);
  if (r.code !== 0 || !m) { failures.push({ shot: s, errors: errorsIn(r.log).length ? errorsIn(r.log) : [r.log.trim() || 'exit ' + r.code] }); continue; }
  info[s] = JSON.parse(m[1]);
}
// A scene may be written before its part: it is listed as waiting, not rendered, and not a failure.
const waiting = {};
for (const s of Object.keys(info)) {
  const missing = info[s].parts.filter((p) => !fs.existsSync(path.join(root, 'ui/Look/parts', p)));
  if (missing.length) { waiting[s] = missing; delete info[s]; }
}

const themeSets = [[]].concat(themes.map((t) => [t]));
const shots = [];
for (const s of Object.keys(info)) {
  const states = shotStates(info[s]);
  for (const st of states) for (const style of styles) for (const set of themeSets) {
    const theme = set.length ? set[0].id : 'none';
    shots.push({ scene: s, state: st, style: style.id, theme, file: [s, st || 'base', style.id, theme].join('-') + '.png',
                 payload: JSON.stringify(payload(style, set)) });
  }
}

let next = 0, done = 0;
async function worker(n) {
  const display = n === 0 ? firstDisplay : await startDisplay().catch(die);
  while (next < shots.length) {
    const shot = shots[next++];
    const out = path.join(outDir, shot.file);
    fs.rmSync(out, { force: true });
    const args = [path.join(sceneDir, shot.scene + '.qml'), shot.payload, out];
    if (shot.state) args.push(shot.state);
    const r = await run(args, display);
    const errors = errorsIn(r.log);
    if (r.code !== 0 || errors.length || !fs.existsSync(out)) {
      shot.failed = true;
      failures.push({ shot: shot.file, errors: errors.length ? errors : [r.log.trim() || 'exit ' + r.code + ', no image'] });
    }
    ++done;
    if (process.stderr.isTTY) process.stderr.write('\r' + done + '/' + shots.length);
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: Math.min(jobs, shots.length) }, (_, n) => worker(n)));
for (const x of servers) { x.removeAllListeners('exit'); x.kill(); }
if (process.stderr.isTTY) process.stderr.write('\n');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// A scene's `frame` (x, y, width, height in the 1920x1080 shot) is what the contact sheet shows of it.
function thumb(shot) {
  const f = info[shot.scene].frame || { x: 0, y: 0, width: 1920, height: 1080 };
  const w = 240, scale = w / f.width, h = Math.round(f.height * scale);
  const img = shot.failed ? '<div class="miss">failed</div>'
    : '<img src="' + esc(shot.file) + '" style="width:' + 1920 * scale + 'px;left:' + -f.x * scale + 'px;top:' + -f.y * scale + 'px">';
  return '<a class="shot" href="' + esc(shot.file) + '"><div class="frame" style="width:' + w + 'px;height:' + h + 'px">' + img +
    '</div><span>' + esc(shot.style) + ' · ' + esc(shot.theme) + '</span></a>';
}
let body = '';
for (const s of Object.keys(info)) {
  body += '<h2>' + esc(s) + '</h2>';
  const states = shotStates(info[s]);
  for (const st of states) {
    body += '<h3>' + esc(st || 'base state') + '</h3><div class="row">' +
      shots.filter((x) => x.scene === s && x.state === st).map(thumb).join('') + '</div>';
  }
}
for (const s in waiting) body += '<h2>' + esc(s) + '</h2><p class="wait">Waits for ' + esc(waiting[s].map((p) => 'ui/Look/parts/' + p).join(', ')) + '.</p>';
if (failures.length) body = '<h2 class="bad">' + failures.length + ' failed</h2><pre>' +
  esc(failures.map((f) => f.shot + '\n  ' + f.errors.join('\n  ')).join('\n')) + '</pre>' + body;
fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Preview matrix</title>' +
  '<style>body{background:#111;color:#ddd;font:14px system-ui,sans-serif;margin:16px}h2{margin:28px 0 4px}h3{margin:12px 0 6px;' +
  'font-weight:500;color:#aaa}.row{display:flex;flex-wrap:wrap;gap:10px}.shot{color:inherit;text-decoration:none}' +
  '.frame{position:relative;overflow:hidden;background:#000;border:1px solid #333}.frame img{position:absolute}' +
  '.shot span{display:block;margin-top:3px;font-size:12px}.miss{color:#f66;padding:8px}.bad{color:#f66}.wait{color:#aaa}pre{white-space:pre-wrap}</style>' +
  '<h1>Preview matrix</h1><p>' + shots.length + ' shots: scene × state × style × theme (none, then each alone).</p>' + body);

console.log(path.join(outDir, 'index.html') + ': ' + shots.length + ' shots in ' + Math.round((Date.now() - started) / 1000) + ' s');
for (const s in waiting) console.error(s + ': not rendered, waits for ' + waiting[s].map((p) => 'ui/Look/parts/' + p).join(', '));
for (const d of deadDisplays) failures.push({ shot: 'display ' + d.split(' ')[0], errors: [d.slice(d.indexOf(' ') + 1) + ' while shots were running'] });
if (failures.length) {
  console.error(failures.length + ' failed:');
  for (const f of failures) console.error(f.shot + '\n  ' + f.errors.join('\n  '));
  process.exit(1);
}
