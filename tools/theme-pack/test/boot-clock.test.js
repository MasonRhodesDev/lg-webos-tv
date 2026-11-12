const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The boot hook's clock step (webos/60-themepack, step 0) run by itself under busybox, the TV's shell and `date`,
// with stand-ins for `curl` (the time server's answer) and `luna-send` (which writes down what it was sent).
// Skipped where there is no busybox: the step reads a date in busybox's own way.
const busybox = spawnSync('sh', ['-c', 'command -v busybox'], { encoding: 'utf8' }).stdout.trim();
const hook = fs.readFileSync(path.join(__dirname, '..', 'webos', '60-themepack'), 'utf8');
const step = hook.slice(hook.indexOf('# 0. The clock'), hook.indexOf('# 1. The bus'));

function boot(opts) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-clock-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  for (const a of ['date', 'cat', 'tr', 'sed', 'head', 'grep']) fs.symlinkSync(busybox, path.join(bin, a));
  const sent = path.join(root, 'sent');
  fs.writeFileSync(path.join(bin, 'luna-send'), '#!/bin/sh\necho "$@" >> ' + sent + '\necho \'{ "returnValue": ' + (opts.refuse ? 'false' : 'true') + ' }\'\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\necho "$@" >> ' + root + '/asked\n' + (opts.answer ? 'printf \'' + opts.answer + '\'\n' : 'exit 7\n'), { mode: 0o755 });
  if (opts.kept !== undefined) fs.writeFileSync(path.join(root, 'clock'), String(opts.kept) + '\n');
  if (opts.server) fs.writeFileSync(path.join(root, 'time-url'), opts.server + '\n');
  const script = 'ROOT=' + root + '\n' + step.replace(/^KEPT=.*$/m, 'KEPT=' + root + '/clock') + '\necho "asked=$asked"\n';
  const r = spawnSync(busybox, ['sh', '-c', script], { encoding: 'utf8', env: { PATH: bin + ':' + process.env.PATH } });
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const utc = /setSystemTime \{"utc":(\d+)\}/.exec(read(sent));
  return { out: r.stdout + r.stderr, set: utc ? Number(utc[1]) : null, asked: read(path.join(root, 'asked')).trim() };
}
const now = () => Math.floor(Date.now() / 1000);
const answer = (date) => 'HTTP/1.1 200 OK\\r\\nServer: any\\r\\n' + date + '\\r\\n\\r\\n';

test('the boot hook leaves a clock alone with nothing later to go by', { skip: !busybox && 'no busybox' }, () => {
  assert.ok(step.length > 200, 'step 0 found in the hook');
  for (const opts of [{}, { kept: 1546300800 }, { kept: 'not a number' }]) {
    const r = boot(opts);
    assert.match(r.out, /^clock left as it is\nasked=0\n$/);
    assert.strictEqual(r.set, null);
  }
});

test('the boot hook starts the clock from the last time kept when that is later', { skip: !busybox && 'no busybox' }, () => {
  const kept = now() + 86400;
  const r = boot({ kept });
  assert.strictEqual(r.set, kept);
  assert.match(r.out, /^clock started from the last time kept: .*\nasked=0\n$/);
  assert.match(boot({ kept, refuse: true }).out, /^clock not set \(the TV refused the last time kept\)\n/);
});

test('the boot hook takes a time server\'s Date line over the time kept, and falls back when it is silent', { skip: !busybox && 'no busybox' }, () => {
  const kept = now() + 86400;
  const r = boot({ kept, server: 'http://time.example/', answer: answer('Date: Sat, 09 Mar 2030 12:00:02 GMT') });
  assert.strictEqual(r.set, Date.UTC(2030, 2, 9, 12, 0, 2) / 1000);
  assert.match(r.out, /^clock set from the time server: .*\nasked=1\n$/);
  assert.match(r.asked, /http:\/\/time\.example\/$/);

  // HTTP/2 writes the header's name in lower case. A server that agrees with the clock sets nothing.
  const same = boot({ server: 'https://time.example/', answer: answer('date: ' + new Date().toUTCString()) });
  assert.strictEqual(same.set, null);
  assert.match(same.out, /^clock agrees with the time server\nasked=1\n$/);

  const silent = boot({ kept, server: 'http://time.example/' });
  assert.strictEqual(silent.set, kept);
  assert.match(silent.out, /asked=0\n$/, 'so the hook asks again once it has run');
  assert.match(boot({ server: 'http://time.example/', answer: answer('Server: no date') }).out, /^clock left as it is\nasked=0\n$/);
});
