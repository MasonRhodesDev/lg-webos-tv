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
