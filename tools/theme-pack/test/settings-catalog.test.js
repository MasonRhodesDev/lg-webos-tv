const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'settings');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
const cats = index.categories.map((c) => ({ entry: c, data: JSON.parse(fs.readFileSync(path.join(dir, c.file), 'utf8')) }));

function hasApi(api) {
  if (!api || typeof api !== 'object') return false;
  if (api.none) return true;
  if (api.service === 'com.webos.settingsservice' && api.keys) return typeof api.category === 'string' && api.keys.length > 0;
  return typeof api.service === 'string' && Object.keys(api).some((k) => k !== 'service' && k !== 'params');
}

test('the index lists every category file and its counts', () => {
  const files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && f !== 'catalog.json').sort();
  assert.deepStrictEqual(index.categories.map((c) => c.file).sort(), files);
  for (const c of cats) {
    assert.strictEqual(c.data.id, c.entry.id);
    assert.strictEqual(c.data.pages.length, c.entry.pages);
    assert.strictEqual(c.data.pages.reduce((n, p) => n + p.items.length, 0), c.entry.items);
  }
});

test('every item has a meaning, an API and a tier', () => {
  for (const c of cats) for (const p of c.data.pages) {
    assert.ok(p.id && p.meaning && Array.isArray(p.lgPath), c.data.id + ' page ' + p.id);
    const ids = new Set();
    for (const it of p.items) {
      const where = c.data.id + '/' + p.id + '/' + it.id;
      assert.ok(it.id && !ids.has(it.id), where + ' id unique on its page');
      ids.add(it.id);
      assert.ok(typeof it.meaning === 'string' && it.meaning.length > 3, where + ' meaning');
      assert.ok([1, 2, 3].indexOf(it.tier) >= 0, where + ' tier');
      assert.ok(hasApi(it.api), where + ' api');
      assert.ok(typeof it.type === 'string' && it.type !== 'unknown', where + ' type');
      if (it.type === 'page') assert.ok(c.data.pages.some((q) => q.id === it.opens), where + ' opens a page of its category');
      if (it.type === 'range' && !it.domain.runtime) assert.ok(it.domain.min < it.domain.max, where + ' range');
      if (it.type === 'enum' || it.type === 'switch') assert.ok(it.domain.runtime || it.domain.values.length > 0, where + ' values');
    }
  }
});

test('the household basics are tier 1', () => {
  const tier1 = new Set();
  for (const c of cats) for (const p of c.data.pages) for (const it of p.items) if (it.tier === 1) tier1.add(it.id);
  for (const id of ['pictureMode', 'soundMode', 'soundOutput', 'sleepTimer', 'networkStatus', 'wifiNetworks', 'captionEnable']) {
    assert.ok(tier1.has(id), id + ' is tier 1');
  }
});

test('LG deep-link targets resolve to pages in the catalog', () => {
  const pages = new Set();
  for (const c of cats) for (const p of c.data.pages) pages.add(p.id);
  const top = { Picture: 1, Sound: 1, Channels: 1, Network: 1, General: 1, Safety: 1, Accessibility: 1 };
  for (const [target, where] of Object.entries(index.lgTargets.map)) {
    const last = Array.isArray(where) ? where[where.length - 1] : where;
    assert.ok(top[last] || pages.has(last) || index.lgTargets.notInCatalog.indexOf(target) >= 0, target + ' -> ' + last);
  }
});

test('the catalog holds no environment details', () => {
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text), f + ' has no IP address');
    assert.ok(!/\/home\/|\/Users\//.test(text), f + ' has no home path');
  }
});
