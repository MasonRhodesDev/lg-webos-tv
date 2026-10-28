// What our Settings should show, from the same code the layer runs: the menu (menu.js), the page framework
// (pages.js) and the Settings stub's target map (settings-stub.mjs's rule over catalog.json).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const THEME = path.join(here, '..', '..');
const lib = (f, ctx) => vm.runInContext(fs.readFileSync(path.join(THEME, 'ui/Look/settings', f), 'utf8')
  .replace(/^\.pragma library$/m, '').replace(/^\.import .*$/mg, ''), ctx);

export function modules() {
  const C = vm.createContext({}); lib('catalog.js', C);
  const M = vm.createContext({}); lib('menu.js', M);
  const P = vm.createContext({ Catalog: C, Menu: M }); lib('pages.js', P);
  return { C, M, P };
}
const { C, M, P } = modules();
export { C as Catalog, M as Menu, P as Pages };

export const catalog = JSON.parse(fs.readFileSync(path.join(THEME, 'settings', 'catalog.json'), 'utf8'));

// LG's deep-link name to the page id the stub asks for ('' for none or an unknown name).
export function stubTarget(name) {
  const where = name === undefined ? undefined : catalog.lgTargets.map[name];
  if (where === undefined) return '';
  return Array.isArray(where) ? where[where.length - 1] : where;
}

// The page stack our Settings opens on for a target (SettingsMenu.openAt): [ids], area.
export function landing(target) {
  const ids = Array.from(P.target(target || ''));
  return ids.length ? { stack: ids, area: 'page' } : { stack: [P.topOf('picture')], area: 'categories' };
}

export const categories = M.categories.map((c) => ({ id: c.id, label: c.label, page: c.page }));

// A settingsservice item by catalog id: { category, key }.
export function settingKey(id) {
  for (const f of fs.readdirSync(path.join(THEME, 'settings'))) {
    if (!f.endsWith('.json') || f === 'catalog.json') continue;
    const cat = JSON.parse(fs.readFileSync(path.join(THEME, 'settings', f), 'utf8'));
    for (const p of cat.pages || []) for (const it of p.items || []) {
      if (it.id === id && it.api && it.api.service === 'com.webos.settingsservice' && it.api.keys) return { category: it.api.category, key: it.api.keys[0] };
    }
  }
  return null;
}

// Whether a page sits behind the PIN (pages.js lockedPage) while nothing is unlocked.
export const locked = (id) => !!P.lockedPage(id, { unlocked: false });
