const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '..', 'tv', 'set-clock.sh');

// tv/set-clock.sh with a stand-in `ssh` first on PATH. The stand-in is the TV's half: it writes down who was called
// and what arrived on stdin, and answers as `body` says.
function run(body) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'set-clock-'));
  const seen = path.join(bin, 'seen');
  fs.writeFileSync(path.join(bin, 'ssh'), '#!/bin/sh\necho "$1" > ' + seen + '.to\n' + body.replace(/SEEN/g, seen) + '\n', { mode: 0o755 });
  const r = spawnSync('sh', [script], { encoding: 'utf8', env: { PATH: bin + ':' + process.env.PATH, TV_HOST: 'tv.example' } });
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null);
  return { status: r.status, out: r.stdout, err: r.stderr, to: read(seen + '.to'), sent: read(seen) };
}

test('set-clock sends this machine\'s time once the TV has answered, and says how far apart they are', () => {
  const before = Math.floor(Date.now() / 1000);
  const r = run('echo ready; read t; echo "$t" > SEEN; echo "set $((t + 2)) Sat Mar 9 12:00:02 UTC 2030"');
  const after = Math.floor(Date.now() / 1000);
  assert.strictEqual(r.status, 0, r.err);
  assert.strictEqual(r.to, 'root@tv.example');
  assert.ok(Number(r.sent) >= before && Number(r.sent) <= after, 'the time sent is now: ' + r.sent);
  assert.match(r.out, /^TV clock set: Sat Mar 9 12:00:02 UTC 2030 \([12] s from this machine's\)\n$/);
});

test('set-clock fails when the TV does not answer or does not take the time', () => {
  const silent = run('exit 255');
  assert.strictEqual(silent.status, 1);
  assert.match(silent.err, /no answer from the TV/);
  assert.strictEqual(silent.sent, null);

  const refused = run('echo ready; read t; echo "$t" > SEEN; echo refused');
  assert.strictEqual(refused.status, 1);
  assert.match(refused.err, /the TV did not take the time/);
  assert.strictEqual(refused.out, '');
});
