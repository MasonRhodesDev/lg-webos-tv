// Refreshes the value domains in the settings catalog from your own TV's settings description, for another firmware or
// country. Only single-key settingsservice items change; meanings, tiers and rules are ours and stay as written.
//   ssh root@"$TV_HOST" cat /etc/palm/description.json > /tmp/description.json
//   node tools/theme-pack/settings/refresh-domains.mjs --desc /tmp/description.json [--country USA] [--resolution UHD]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
function opt(name, fallback) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; }
const descFile = opt('desc');
if (!descFile) { console.error('usage: refresh-domains.mjs --desc <description.json> [--country USA] [--resolution UHD]'); process.exit(2); }
const country = opt('country', 'USA');
const resolution = opt('resolution', 'UHD');
const desc = JSON.parse(fs.readFileSync(descFile, 'utf8'));
const dir = path.dirname(fileURLToPath(import.meta.url));

export function pick(entries, category, key) {
  const all = entries.filter((d) => d.key === key && d.category === category &&
    (!d.condition || JSON.stringify(d.condition) === JSON.stringify({ resolution: resolution })));
  if (!all.length) return null;
  const mine = all.find((d) => d.country && d.country.split(/,\s*/).indexOf(country) >= 0);
  const fallback = all.find((d) => d.country === 'default') || all.find((d) => !d.country) || all[0];
  return { d: mine || fallback, src: mine ? country : (fallback.country === 'default' ? 'default' : 'base') };
}

export function domainOf(d) {
  const v = d.values || {};
  if (d.vtype === 'Range') {
    return v.range && v.range.max !== undefined ? { type: 'range', domain: { min: v.range.min, max: v.range.max, step: v.range.interval } }
      : { type: 'range', domain: { runtime: true } };
  }
  if (d.vtype === 'ArrayExt' || d.vtype === 'Array') {
    const vals = (v.arrayExt || []).map((a) => a.value);
    if (!vals.length) return { type: 'dynamic', domain: { runtime: true } };
    const s = vals.slice().sort().join('|');
    return { type: s === 'off|on' || s === 'false|true' ? 'switch' : 'enum', domain: { values: vals } };
  }
  return { type: d.vtype === 'File' ? 'file' : String(d.vtype).toLowerCase(), domain: { runtime: true } };
}

const index = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
let changed = 0, missing = [];
for (const c of index.categories) {
  const file = path.join(dir, c.file);
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const p of cat.pages) for (const it of p.items) {
    const api = it.api;
    if (api.service !== 'com.webos.settingsservice' || !api.keys || api.keys.length !== 1 || api.keys[0] !== it.id) continue;
    if (['info', 'action'].indexOf(it.type) >= 0) continue;
    const found = pick(desc, api.category, it.id);
    if (!found) { missing.push(api.category + '.' + it.id); continue; }
    const dm = domainOf(found.d);
    const before = JSON.stringify([it.type, it.domain, it.dimension]);
    it.type = dm.type; it.domain = dm.domain;
    if (found.d.dimension && found.d.dimension.length) it.dimension = found.d.dimension; else delete it.dimension;
    it.domainSource = 'description.json, ' + found.src + ' variant';
    if (JSON.stringify([it.type, it.domain, it.dimension]) !== before) changed++;
  }
  fs.writeFileSync(file, JSON.stringify(cat, null, 1) + '\n');
}
console.log(changed + ' items changed' + (missing.length ? '; not in this description: ' + missing.join(', ') : ''));
