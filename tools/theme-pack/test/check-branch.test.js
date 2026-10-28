const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../check-branch.mjs');
// Built from parts so this file does not itself trip the portability check.
const ip = (...p) => p.join('.');

test('trailer matcher flags attribution lines and passes ordinary messages', async () => {
  const { findTrailer } = await load();
  assert.ok(findTrailer('Fix it\n\nCo-Authored-By: Someone <a@b.c>'));
  assert.ok(findTrailer('Fix it\n\nco-authored-by: x'));
  assert.ok(findTrailer('Fix it\n\nGenerated with a tool'));
  assert.ok(findTrailer('Fix it \u{1F916}'));
  assert.strictEqual(findTrailer('Fix the co-author credit in the README\n\nNo trailers here.'), null);
});

test('core file matcher takes core and core.<digits> only', async () => {
  const { isCoreFile } = await load();
  assert.ok(isCoreFile('core') && isCoreFile('core.1234') && isCoreFile('tools/x/core.99'));
  assert.ok(!isCoreFile('core.js') && !isCoreFile('core.') && !isCoreFile('score') && !isCoreFile('core/readme'));
});

test('portability matcher flags RFC 1918 addresses and home paths', async () => {
  const { findPrivate } = await load();
  for (const s of [ip(10, 0, 0, 5), ip(192, 168, 1, 20), ip(172, 16, 3, 4), ip(172, 31, 255, 1), 'ssh root@' + ip(10, 1, 2, 3),
    '/home/' + 'alice/repos/x', 'cd /Users/' + 'bob/code']) assert.ok(findPrivate(s), s);
});

test('portability matcher passes public addresses, placeholders and lookalikes', async () => {
  const { findPrivate } = await load();
  for (const s of [ip(8, 8, 8, 8), ip(172, 32, 0, 1), ip(172, 15, 0, 1), ip(1, 10, 0, 0, 5), 'version ' + ip(110, 0, 0, 1),
    '/home/<user>/repos', 'the /usr/home dir', 'localhost 127.0.0.1', 'relative home/alice/x']) assert.strictEqual(findPrivate(s), null, s);
});

test('local patterns parse one per line and skip comments', async () => {
  const { parsePatterns, findPrivate } = await load();
  const p = parsePatterns('# note\n\nmy-dev-box\n');
  assert.strictEqual(p.length, 1);
  assert.ok(findPrivate('ssh my-dev-box', p));
  assert.strictEqual(findPrivate('other', p), null);
});

test('render failure note shows the failing shots, never the progress counter', async () => {
  const { renderFailureNote } = await load();
  const progress = '\r1/560\r2/560\r3/560\n';
  const out = 'index.html: 560 shots in 60 s\n';
  const err = progress + '2 failed:\nAlert-base-bubble-none.png\n  qml: shot: no shot after 120 s\nToast-base-x.png\n  Toast.qml:12: TypeError: boom\n';
  const note = renderFailureNote({ status: 1, stdout: out, stderr: err });
  assert.match(note, /exit 1/);
  assert.match(note, /Alert-base-bubble-none\.png/);
  assert.match(note, /Toast\.qml:12: TypeError: boom/);
  assert.doesNotMatch(note, /\d+\/560/);
});

test('render failure note without a failure list shows the tail of the output and the signal', async () => {
  const { renderFailureNote } = await load();
  const note = renderFailureNote({ status: null, signal: 'SIGKILL', stdout: '', stderr: '\r1/5\r2/5\nError: boom\n    at x (y.mjs:1:1)\nNode.js v22.0.0\n' });
  assert.match(note, /killed by SIGKILL/);
  assert.match(note, /Error: boom/);
  assert.doesNotMatch(note, /\d+\/5\b/);
  assert.match(renderFailureNote({ status: 3, stdout: '', stderr: '' }), /exit 3 with no output/);
});
