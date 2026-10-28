// The contact sheet of a run: each TV capture beside its board (rendered from the saved canvas source with headless
// Chromium) or, without one, the matching preview shot from preview/render.mjs; the assertions; and how every
// TV-CHECKS.md item is covered. Written into the run's own directory, never the repo.
import fs from 'node:fs';
import path from 'node:path';
import { render } from './boards.mjs';
import { coverage } from './coverage.mjs';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The preview shot for a scene in the look the capture was taken in (the theme's first entry, as render.mjs names it).
function previewShot(dir, scene, look) {
  if (!dir || !scene || !fs.existsSync(dir)) return null;
  const style = look && look.style || 'smoke', theme = look && look.themes && look.themes[0] || 'none';
  const files = fs.readdirSync(dir);
  for (const want of [[scene, 'base', style, theme], [scene, 'base', style, 'none']]) {
    const f = want.join('-') + '.png';
    if (files.includes(f)) return path.join(dir, f);
  }
  const any = files.find((f) => f.startsWith(scene + '-') && f.endsWith('-' + style + '-' + theme + '.png'));
  return any ? path.join(dir, any) : null;
}

export async function writeReport(out, { boards, preview, say = () => {} } = {}) {
  const rf = path.join(out, 'results.json');
  const results = fs.existsSync(rf) ? JSON.parse(fs.readFileSync(rf, 'utf8')) : { started: '', finished: '', runs: [], end: [] };
  const deployFile = path.join(out, 'deploy.json');
  const deployed = fs.existsSync(deployFile) ? JSON.parse(fs.readFileSync(deployFile, 'utf8')) : null;
  const boardDir = path.join(out, 'boards');
  const rel = (f) => path.relative(out, f);
  const why = {};
  function beside(c) {
    if (boards && c.board) {
      const r = render(boards, c.board, boardDir);
      if (r.file) return { file: rel(r.file), label: 'board ' + c.board };
      why[c.board] = r.why;
    }
    const p = previewShot(preview, c.scene, c.look);
    if (p) return { file: path.isAbsolute(p) ? 'file://' + p : p, label: 'preview ' + path.basename(p) };
    return { file: null, label: c.board ? 'board ' + c.board + (boards ? ' (' + (why[c.board] || 'not rendered') + ')' : ' (no --boards)') : 'no board for this screen' + (c.scene && !preview ? ' (no --preview)' : '') };
  }

  const read = (f) => fs.existsSync(path.join(out, f)) ? JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')) : null;
  const boot = read('coldboot.json'), man = read('manual.json');
  const status = {};
  for (const r of results.runs) for (const id of r.tvChecks || []) (status[id] = status[id] || []).push(r.id + ' ' + r.status);
  if (deployed) for (const s of deployed.steps || []) status['deploy ' + s.id] = [s.ok ? 'pass' : 'fail'];
  for (const it of (man && man.items) || []) for (const id of it.covers || []) (status[id] = status[id] || []).push('manual ' + it.id + ' ' + it.verdict);
  if (boot) for (const id of ['stub-mounted', 'stub-resident', 'hook-order', 'telemetry']) (status[id] = status[id] || []).push('coldboot ' + (boot.ok ? 'pass' : 'fail'));

  const sec = results.runs.map((r) => {
    const checks = r.checks.map((c) => '<li class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? 'ok' : 'FAIL') + ' ' + esc(c.name) + (c.detail ? ' <small>' + esc(c.detail) + '</small>' : '') + '</li>').join('');
    const caps = r.captures.map((c) => {
      const b = beside(c);
      return '<figure><div class="pair"><img src="' + esc(c.file) + '" alt="TV"><span>' + (b.file ? '<img src="' + esc(b.file) + '" alt="reference">' : '<i>' + esc(b.label) + '</i>') + '</span></div>' +
        '<figcaption>' + esc(c.name) + ' · TV' + (c.look ? ' (' + esc(c.look.style + ' ' + (c.look.themes || []).join('+')) + ')' : '') + ' | ' + esc(b.label) + '</figcaption></figure>';
    }).join('');
    return '<section id="' + esc(r.id) + '"><h2 class="' + r.status + '">' + esc(r.status.toUpperCase()) + ' ' + esc(r.id) + '</h2><p>' + esc(r.title) +
      (r.reason ? '<br><b>' + esc(r.reason) + '</b>' : '') + '</p><p class="keys">keys: ' + esc(r.keys.join(' ') || 'none') + '</p><ul>' + checks + '</ul>' + caps + '</section>';
  }).join('');

  const cov = coverage().map((x) => {
    const e = x.entries[0] || { how: 'not covered', reason: 'no entry in lib/coverage.mjs' };
    const st = e.id && status[e.id] ? status[e.id].join(', ') : '';
    return '<tr><td>' + esc(x.item) + '</td><td>' + esc(e.how) + '</td><td>' + esc(e.by || '') + '</td><td>' + esc(st) + '</td><td>' + esc(e.reason || '') + '</td></tr>';
  }).join('');
  const end = (results.end || []).map((c) => '<li class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? 'ok' : 'FAIL') + ' ' + esc(c.name) + ' <small>' + esc(c.detail) + '</small></li>').join('');
  const dep = deployed ? '<h2>Deploy</h2><ul>' + deployed.steps.map((s) => '<li class="' + (s.ok ? 'ok' : 'bad') + '">' + esc(s.id) + (s.reason ? ': ' + esc(s.reason) : '') + '</li>').join('') + '</ul>' : '';
  const li = (c) => '<li class="' + (c.ok ? 'ok' : 'bad') + '">' + (c.ok ? 'ok' : 'FAIL') + ' ' + esc(c.name) + (c.detail ? ' <small>' + esc(c.detail) + '</small>' : '') + '</li>';
  const bootSec = boot ? '<h2>Cold boot</h2><p>seconds since power-on: ' + esc(JSON.stringify(boot.timings)) + '; telemetry ' + esc(boot.telemetry) + '</p><ul>' + boot.checks.map(li).join('') + '</ul>' : '';
  const manSec = man ? '<h2>Manual pass</h2><table><tr><th>Item</th><th>Verdict</th><th>Note</th><th>The suite saw</th><th>Its checks</th></tr>' + man.items.map((it) =>
    '<tr><td>' + esc(it.id) + '</td><td>' + esc(it.verdict) + '</td><td>' + esc(it.note) + '</td><td><small>' + it.saw.map((x) => esc(x.t + ' s ' + x.what)).join('<br>') +
    '</small></td><td><ul>' + it.checks.map(li).join('') + '</ul></td></tr>').join('') + '</table>' : '';
  const nav = results.runs.map((r) => '<a class="' + r.status + '" href="#' + esc(r.id) + '">' + esc(r.id) + '</a>').join(' ');

  const html = '<!doctype html><html><head><meta charset="utf-8"><title>TV suite run</title><style>' +
    ':root{--bg:#101014;--ink:#eee;--dim:#999;--ok:#7c6;--bad:#f67;--skip:#cb5}body{background:var(--bg);color:var(--ink);font:14px system-ui,sans-serif;margin:16px}' +
    'h2.pass,a.pass{color:var(--ok)}h2.fail,a.fail{color:var(--bad)}h2.skip,a.skip{color:var(--skip)}li.ok{color:var(--ok)}li.bad{color:var(--bad)}small{color:var(--dim)}' +
    'figure{margin:8px 0 16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}.pair img{width:100%;background:#000;display:block}.pair i{color:var(--dim)}' +
    'figcaption{color:var(--dim)}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:4px;vertical-align:top;text-align:left}.keys{color:var(--dim)}' +
    'a{margin-right:8px}</style></head><body><h1>TV suite run' + (results.dry ? ' (dry run, fake TV)' : '') + '</h1><p>' + esc(results.started) + ' to ' + esc(results.finished) + '</p>' +
    '<p>' + nav + '</p>' + dep + bootSec + manSec + '<h2>End of run</h2><ul>' + end + '</ul>' + sec +
    '<h2>TV-CHECKS coverage</h2><table><tr><th>Item</th><th>How</th><th>By</th><th>This run</th><th>Why / what is left</th></tr>' + cov + '</table></body></html>';
  const file = path.join(out, 'index.html');
  fs.writeFileSync(file, html);
  for (const [b, w] of Object.entries(why)) say('board ' + b + ': ' + w);
  return file;
}
