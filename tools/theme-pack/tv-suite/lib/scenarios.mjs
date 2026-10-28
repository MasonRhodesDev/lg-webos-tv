// The scenarios, in the order they run. Each is one sequence: preconditions, guarded keys with polled waits,
// captures beside their board (canvas board name) or preview scene, assertions, and its own cleanup (the runner also
// closes everything and restores the snapshot). The write-* scenarios make one reversible write each through our UI
// (the TV name, Quick Start+, Picture mode, the Volume row) and undo it the same way, checked on the TV. Nothing else
// is written, and nothing ever resets, changes the PIN, joins or forgets a network, pairs, connects or forgets a
// Bluetooth device, switches the input or scans channels: the guard refuses the keys that could (keys.mjs).
import { landing, stubTarget, categories, catalog, locked } from './expect.mjs';

const SVC = 'luna://dev.themepack.look.service';
const SAM = 'luna://com.webos.applicationManager';
const SYSUI = 'luna://com.webos.service.systemUIManager';
const PICKER = 'com.webos.app.quickinputpicker';
const SETTINGS_APP = '/usr/palm/applications/com.palm.app.settings';
// Another look for the theme-swap checks; any style and theme other than the current one would do.
const SWAP = { style: 'bubble', themes: ['winter'] };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const top = (v) => v.stack[v.stack.length - 1];

async function own(ctx, which, pred, what, opts) {
  return ctx.wait(what, async () => {
    const s = await ctx.settings();
    const v = s[which] || {};
    return pred(v) ? v : JSON.stringify({ open: v.open, stack: v.stack, area: v.area, focus: v.focus && v.focus.label });
  }, opts);
}
const closed = (ctx, which) => own(ctx, which, (v) => !v.open, 'our ' + which + ' to close');

// Opens our Settings the way the stub does (openSettings), and waits for it to land where SettingsMenu.openAt does.
async function openSettings(ctx, target) {
  const want = landing(target);
  await ctx.luna(SVC + '/openSettings', target ? { target } : {});
  return own(ctx, 'menu', (v) => v.open && same(v.stack, want.stack) && v.area === want.area,
    'Settings at ' + (target || 'the top') + ' (' + want.stack.join('/') + ', ' + want.area + ')');
}

// Moves focus to the row labelled `label`, first one way (Down unless `first` is 'UP'), then the other; every press
// must move focus.
async function toRow(ctx, which, label, first = 'DOWN') {
  for (const dir of first === 'UP' ? ['UP', 'DOWN'] : ['DOWN', 'UP']) {
    for (let i = 0; i < 40; i++) {
      const v = (await ctx.settings())[which];
      if (v.focus && v.focus.label === label) return v;
      const at = v.focus ? v.focus.index : -1;
      await ctx.key(dir);
      const moved = await own(ctx, which, (w) => w.focus && w.focus.index !== at, 'focus to move ' + dir, { timeout: 2000 }).catch(() => null);
      if (!moved) break;
    }
  }
  throw new Error('no row "' + label + '" in ' + which);
}

// Walks the keyboard's focus to `label` with the D-pad (each press must move it) and presses it.
async function typeKey(ctx, label) {
  for (let i = 0; i < 40; i++) {
    const e = (await ctx.settings()).menu.editing;
    if (!e) throw new Error('the keyboard closed before ' + label);
    let at = null;
    e.keys.forEach((r, ri) => r.forEach((k, ci) => { if (k === label && !at) at = { row: ri, col: ci }; }));
    if (!at) throw new Error('no key "' + label + '" on the keyboard (' + e.keys.map((r) => r.join('')).join(' / ') + ')');
    if (e.row === at.row && e.col === at.col) { await ctx.key('ENTER', { type: true }); return; }
    const dir = e.row !== at.row ? (e.row < at.row ? 'DOWN' : 'UP') : (e.col < at.col ? 'RIGHT' : 'LEFT');
    await ctx.key(dir, { type: true });
    await own(ctx, 'menu', (w) => w.editing && (w.editing.row !== e.row || w.editing.col !== e.col), 'the keyboard focus to move ' + dir, { timeout: 2000 });
  }
  throw new Error('could not reach key ' + label);
}

// Waits for a write to land on the TV. If it does not, the finding is what our Settings reported about it (the
// store reports "settings: <ref> not saved: <why>" when the TV refuses or never answers).
async function written(ctx, what, ref, pred, t0) {
  const ok = await ctx.wait(what, pred, { timeout: 8000 }).catch(() => null);
  if (ok) { ctx.check(what, true); return true; }
  const r = (await ctx.tv.reports(t0)).filter((x) => x.text.indexOf('settings: ') === 0 && x.text.indexOf(ref) >= 0);
  ctx.must(what, false, r.length ? 'the TV refused: ' + r.map((x) => x.text).join('; ') : 'not written, and nothing reported');
  return false;
}

// Moves a picker's focus to the choice `want`, Down then Up.
async function toChoice(ctx, which, pred, what) {
  for (const dir of ['DOWN', 'UP']) {
    for (let i = 0; i < 40; i++) {
      const v = (await ctx.settings())[which];
      if (v.focus && pred(v.focus)) return v;
      await ctx.key(dir);
      const moved = await own(ctx, which, (w) => w.focus && w.focus.index !== v.focus.index, 'focus to move', { timeout: 2000 }).catch(() => null);
      if (!moved) break;
    }
  }
  throw new Error('no choice ' + what);
}

async function gear(ctx) {
  await ctx.key('QMENU');
  return own(ctx, 'quick', (v) => v.open, 'the quick sheet to open');
}

// Back out of our Settings until it closes; each Back must take one step (SETTINGS-PLAN.md 3.4).
async function backOut(ctx, which) {
  for (let i = 0; i < 12; i++) {
    const v = (await ctx.settings())[which];
    if (!v.open) return i;
    const was = JSON.stringify([v.stack, v.area, !!v.pin, !!v.editing, v.dialog]);
    await ctx.key('BACK');
    await own(ctx, which, (w) => !w.open || JSON.stringify([w.stack, w.area, !!w.pin, !!w.editing, w.dialog]) !== was, 'Back to take a step', { timeout: 3000 });
  }
  throw new Error(which + ' still open after 12 Backs');
}

async function noLgSettings(ctx, what) {
  const r = await ctx.luna(SAM + '/running', {});
  const running = (r.running || []).map((a) => a.id);
  ctx.check(what + ": LG's Settings is not running", !running.includes('com.palm.app.settings'), running.join(', '));
}

export const SCENARIOS = [
  {
    id: 'volume',
    title: 'Volume keys draw our volume bar, then the level goes back',
    tvChecks: ['volume-calls'],
    async run(ctx) {
      const v0 = await ctx.volume();
      if (v0.muted) ctx.skip('the TV is muted: a volume key would unmute it');
      const [first, second] = v0.volume >= 100 ? ['VOLUMEDOWN', 'VOLUMEUP'] : ['VOLUMEUP', 'VOLUMEDOWN'];
      const d = first === 'VOLUMEUP' ? 1 : -1;
      await ctx.key(first, { volume: true });
      await ctx.wait('the volume to step', async () => (await ctx.volume()).volume === v0.volume + d);
      await ctx.wait('our volume bar to show', async () => { const s = await ctx.state(); return !!(s.volume && s.volume.shown && s.volume.level === v0.volume + d); });
      await ctx.capture('volume-step', { board: 'SmokeOverlays', scene: 'VolumeBar' });
      await ctx.key(second, { volume: true });
      await ctx.wait('the volume to come back', async () => (await ctx.volume()).volume === v0.volume);
      await ctx.capture('volume-back', { board: 'SmokeOverlays', scene: 'VolumeBar' });
      ctx.check('volume back at ' + v0.volume, (await ctx.volume()).volume === v0.volume);
      await ctx.wait('the volume bar to hide', async () => { const s = await ctx.state(); return !(s.volume && s.volume.shown); }, { timeout: 10000 });
    }
  },
  {
    id: 'mute',
    title: 'Mute twice: our mute badge, then sound again',
    tvChecks: ['volume-calls'],
    async run(ctx) {
      const v0 = await ctx.volume();
      if (v0.muted) ctx.skip('the TV is already muted');
      await ctx.key('MUTE', { volume: true });
      await ctx.wait('muted', async () => (await ctx.volume()).muted === true);
      await ctx.wait('our mute badge', async () => { const s = await ctx.state(); return !!((s.mute && s.mute.shown) || (s.volume && s.volume.shown && s.volume.muted)); });
      await ctx.capture('muted', { board: 'SmokeOverlays', scene: 'VolumeMute' });
      await ctx.key('MUTE', { volume: true });
      await ctx.wait('unmuted', async () => (await ctx.volume()).muted === false);
      ctx.check('volume unchanged', (await ctx.volume()).volume === v0.volume);
    }
  },
  {
    id: 'toast',
    title: 'A toast (createToast) in our toast card',
    tvChecks: [],
    async run(ctx) {
      const message = 'TV suite toast ' + Date.now();
      await ctx.luna('luna://com.webos.notification/createToast', { sourceId: 'dev.themepack.look', message });
      await ctx.wait('our toast with the message', async () => { const s = await ctx.state(); return !!(s.toast && s.toast.shown && s.toast.message === message); });
      await ctx.capture('toast', { board: 'SmokeOverlays', scene: 'Toast' });
      await ctx.wait('the toast to go', async () => { const s = await ctx.state(); return !(s.toast && s.toast.shown); }, { timeout: 12000 });
    }
  },
  {
    id: 'input-picker',
    title: 'Input picker: launch, move, close; never select',
    tvChecks: [],
    async run(ctx) {
      const st = await ctx.state();
      // A second launch while it is open counts as an Input press and switches the input after 5 s.
      if (st.systemUi === PICKER || (st.picker && st.picker.shown)) ctx.skip('the input picker is already open');
      if (st.systemUi === 'unknown') ctx.skip("systemUIManager's answer is unreadable: the picker might be open, and a second launch switches the input");
      const fg = await ctx.foreground();
      await ctx.luna(SYSUI + '/launch', { appId: PICKER });
      const p = await ctx.wait('our input picker', async () => { const s = await ctx.state(); return s.picker && s.picker.shown ? s.picker : null; });
      await ctx.capture('picker', { board: 'SmokeInputPicker', scene: 'InputPicker' });
      await ctx.key('RIGHT');
      await ctx.wait('picker focus to move', async () => { const s = await ctx.state(); return !!(s.picker && s.picker.focus !== p.focus); });
      await ctx.capture('picker-moved', { board: 'SmokeInputPicker', scene: 'InputPicker' });
      await ctx.key('LEFT');
      await ctx.wait('picker focus back', async () => { const s = await ctx.state(); return !!(s.picker && s.picker.focus === p.focus); });
      await ctx.key('BACK');
      await ctx.wait('the picker to close on Back', async () => { const s = await ctx.state(); return !(s.picker && s.picker.shown) && s.systemUi !== PICKER; });
      // An accidental Input press would switch after 5 s.
      await ctx.sleep(6000);
      ctx.check('the input did not change', (await ctx.foreground()) === fg, fg);
    }
  },
  {
    id: 'quick-sheet',
    title: "The gear's quick sheet: open, move, a picker opened and backed out of, All settings, Back",
    tvChecks: ['hookA-report', 'gear-opens', 'gear-closes', 'no-lg-qs', 'qs-entry', 'hotkeys', 'focus-chain', 'back-rule'],
    async run(ctx) {
      const r = await ctx.tv.reports();
      ctx.check('reports: the gear opens our quick sheet', r.some((x) => x.kind === 'ok' && x.text === 'settings: the gear opens our quick sheet (system UI table)'));
      const pm = await ctx.setting('pictureMode');
      let q = await gear(ctx);
      ctx.check('the sheet lands on Picture mode', q.focus && q.focus.label === 'Picture mode', q.focus && q.focus.label);
      const st = await ctx.state();
      ctx.check("no LG Quick Settings window", st.systemUi !== 'com.webos.app.quicksettings' && st.systemUi !== 'unknown', st.systemUi || 'none');
      ctx.check('reports: no fallback to LG', !(await ctx.tv.reports()).some((x) => /handed to LG's Quick Settings/.test(x.text)));
      await ctx.capture('sheet', { board: 'SmokeQuickSettings', scene: 'QuickSheet' });
      await ctx.key('DOWN');
      await own(ctx, 'quick', (v) => v.focus && v.focus.index > q.focus.index, 'Down to move');
      await ctx.capture('sheet-down', { board: 'SmokeQuickSettings', scene: 'QuickSheet' });
      await toRow(ctx, 'quick', 'Picture mode', 'UP');
      await ctx.key('ENTER');
      q = await own(ctx, 'quick', (v) => top(v) === 'pick:pictureMode', 'the Picture mode picker');
      ctx.check('the picker lands on the current mode', q.focus && q.focus.choice === String(pm), q.focus && q.focus.choice);
      await ctx.capture('sheet-picker', { board: 'SmokeQuickSettings', scene: 'QuickSheet' });
      await ctx.key('DOWN');
      await ctx.key('BACK');
      await own(ctx, 'quick', (v) => v.open && top(v) === 'quick', 'Back to the sheet');
      ctx.check('Picture mode unchanged', (await ctx.setting('pictureMode')) === pm, String(pm));
      await toRow(ctx, 'quick', 'All settings');
      await ctx.key('ENTER');
      await own(ctx, 'menu', (v) => v.open, 'All settings to open our Settings');
      ctx.check('the sheet closed for Settings', !(await ctx.settings()).quick.open);
      await ctx.capture('all-settings', { board: 'SmokeSettings', scene: 'Settings' });
      await backOut(ctx, 'menu');
      ctx.check('Settings closed after Back', !(await ctx.settings()).menu.open);
      // The gear toggles: a second press closes.
      await gear(ctx);
      await ctx.sleep(800);
      await ctx.key('QMENU');
      await closed(ctx, 'quick');
      // showQuickSettings (the call LG's own callers make) opens ours too.
      await ctx.luna('luna://com.webos.surfacemanager/showQuickSettings', {});
      await own(ctx, 'quick', (v) => v.open, 'showQuickSettings to open our sheet');
      await backOut(ctx, 'quick');
      await noLgSettings(ctx, 'after the sheet');
    }
  },
  {
    id: 'settings-categories',
    title: 'Settings: every category, from the category list (nothing entered)',
    tvChecks: ['host-reads'],
    async run(ctx) {
      await openSettings(ctx, '');
      const boards = { picture: 'SmokeSettings', sound: 'SmokeSettingsSound', connection: 'SmokeSettingsConnection', general: 'SmokeSettingsGeneral',
                       accessibility: 'SmokeSettingsAccessibility', support: 'SmokeSettingsSupport' };
      for (const [i, c] of categories.entries()) {
        if (i) await ctx.key('DOWN');
        const v = await own(ctx, 'menu', (w) => w.area === 'categories' && w.category === c.id && same(w.stack, [c.page]), 'the ' + c.label + ' category');
        ctx.check(c.label + ' shows ' + c.page, top(v) === c.page);
        await ctx.capture('category-' + c.id, { board: boards[c.id], scene: 'Settings' });
      }
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'picture-mode',
    title: 'Settings: the Picture mode picker opened and backed out of',
    tvChecks: ['host-reads', 'back-rule'],
    async run(ctx) {
      const pm = await ctx.setting('pictureMode');
      await openSettings(ctx, '');
      await ctx.key('RIGHT');
      await own(ctx, 'menu', (v) => v.area === 'page', 'focus in the Picture page');
      await toRow(ctx, 'menu', 'Picture mode');
      await ctx.key('ENTER');
      const v = await own(ctx, 'menu', (w) => top(w) === 'pick:pictureMode', 'the Picture mode picker');
      ctx.check('it lands on the current mode', v.focus && v.focus.choice === String(pm), (v.focus && v.focus.choice) + ' vs ' + pm);
      await ctx.capture('picture-mode-picker', { board: 'SmokeSettingsPictureMode', scene: 'Settings' });
      await ctx.key('DOWN');
      await ctx.key('BACK');
      await own(ctx, 'menu', (w) => top(w) === 'Picture', 'Back to Picture');
      ctx.check('Picture mode unchanged', (await ctx.setting('pictureMode')) === pm, String(pm));
      // The PictureMode page itself (the board's drill-in), view only.
      await openSettings(ctx, 'PictureMode');
      await ctx.capture('picture-mode-page', { board: 'SmokeSettingsPictureMode', scene: 'Settings' });
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'look',
    title: 'Settings: the Look page, a style and a theme switched, then the look restored',
    tvChecks: [],
    async run(ctx) {
      const look0 = await ctx.look();
      await openSettings(ctx, 'Look');
      await ctx.capture('look', { scene: 'Settings' });
      // A style row other than the current one.
      let v = (await ctx.settings()).menu;
      for (let i = 0; i < 20 && !(v.focus && v.focus.kind === 'style' && v.focus.choice !== look0.style); i++) {
        await ctx.key('DOWN');
        v = await own(ctx, 'menu', (w) => !!w.focus, 'focus');
      }
      ctx.must('a second style row', v.focus && v.focus.kind === 'style', JSON.stringify(v.focus));
      const style = v.focus.choice;
      await ctx.key('ENTER', { look: true });
      await ctx.wait('the style to switch', async () => (await ctx.look()).style === style);
      await ctx.capture('look-style-' + style, { scene: 'Settings' });
      for (let i = 0; i < 20 && !(v.focus && v.focus.kind === 'theme'); i++) {
        await ctx.key('DOWN');
        v = await own(ctx, 'menu', (w) => !!w.focus, 'focus');
      }
      ctx.must('a theme row', v.focus && v.focus.kind === 'theme', JSON.stringify(v.focus));
      const theme = v.focus.choice, had = (look0.themes || []).includes(theme);
      await ctx.key('ENTER', { look: true });
      await ctx.wait('the theme to switch', async () => (await ctx.look()).themes.includes(theme) !== had);
      await ctx.capture('look-theme-' + theme, { scene: 'Settings' });
      await ctx.setLook(look0);
      await ctx.wait('the look restored', async () => same(await ctx.look(), look0));
      ctx.check('the look restored', same(await ctx.look(), look0), JSON.stringify(look0));
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'pages-view',
    title: 'Settings: Wi-Fi, Bluetooth, Safety, Keyboard and text, Signal test, viewed only',
    tvChecks: ['wifi-scan'],
    async run(ctx) {
      const pages = [['Wifi', 'SmokeSettingsConnection'], ['Bluetooth', 'SmokeSettingsConnection'], ['Safety', null], ['KeyboardInput', null], ['SignalTest', 'SmokeSettingsSupport']];
      for (const [id, board] of pages) {
        const v = await openSettings(ctx, id);
        ctx.check(id + ' opens', top(v) === id);
        await ctx.capture('page-' + id, { board, scene: 'Settings' });
      }
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'back-in-prompts',
    title: 'BACK closes the TV name keyboard and the PIN prompt (BACK is not Backspace)',
    tvChecks: ['back-key'],
    async run(ctx) {
      const name = await ctx.setting('deviceName');
      await openSettings(ctx, 'KeyboardInput');
      await toRow(ctx, 'menu', 'TV name');
      await ctx.key('ENTER', { text: true });
      const e = await own(ctx, 'menu', (v) => !!v.editing, 'the keyboard');
      await ctx.capture('keyboard', { board: 'SmokeKeyboard', scene: 'KitForms' });
      await ctx.key('BACK');
      const v = await own(ctx, 'menu', (w) => !w.editing, 'BACK to close the keyboard', { timeout: 3000 })
        .catch(async () => { const w = (await ctx.settings()).menu; throw new Error('BACK left the keyboard up (' + (w.editing ? w.editing.length + ' chars, was ' + e.editing.length : '?') + '): BACK may arrive as Backspace'); });
      ctx.check('BACK closed the keyboard, on its page', v.open && top(v) === 'KeyboardInput');
      ctx.check('the TV name unchanged', (await ctx.setting('deviceName')) === name);
      await openSettings(ctx, 'RatingLocks');
      await own(ctx, 'menu', (w) => w.pin && w.pin.mode === 'page', 'the PIN prompt');
      await ctx.key('BACK');
      const p = await own(ctx, 'menu', (w) => !w.pin, 'BACK to close the PIN prompt', { timeout: 3000 });
      ctx.check('BACK left the locked page', !locked(top(p)), top(p));
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'pin',
    title: 'The PIN prompt of a locked page: a wrong PIN, then Back',
    tvChecks: ['pin-read'],
    async run(ctx) {
      // A code that is not the TV's PIN; the PIN itself is never logged.
      let pin;
      try { pin = (await ctx.luna('luna://com.webos.settingsservice/getSystemSettings', { category: 'lock', keys: ['systemPin'] })).settings.systemPin; } catch (e) { pin = undefined; }
      ctx.check('the PIN is readable (lock.systemPin)', pin !== undefined);
      const digit = String(pin) === '1111' ? '2' : '1';
      await openSettings(ctx, 'RatingLocks');
      let v = await own(ctx, 'menu', (w) => w.pin && w.pin.mode === 'page', 'the PIN prompt');
      await ctx.capture('pin', { board: 'SmokePin', scene: 'KitForms' });
      if (digit === '2') { await ctx.key('RIGHT'); v = await own(ctx, 'menu', (w) => w.pin && w.pin.pad === 1, 'the pad on 2'); }
      for (let i = 0; i < 4; i++) {
        await ctx.key('ENTER', { pin: true });
        v = await own(ctx, 'menu', (w) => w.pin && (w.pin.length === i + 1 || w.pin.error), 'digit ' + (i + 1));
      }
      v = await own(ctx, 'menu', (w) => w.pin && w.pin.error, 'the prompt to refuse the PIN');
      ctx.check('a wrong PIN is refused', /Wrong PIN|has not given us its PIN/.test(v.pin.error), v.pin.error);
      ctx.check('the page stays locked', !!v.pin && v.pin.length === 0);
      await ctx.capture('pin-wrong', { board: 'SmokePin', scene: 'KitForms' });
      await ctx.key('BACK');
      v = await own(ctx, 'menu', (w) => !w.pin, 'Back to close the prompt');
      ctx.check('Back left the locked page', !locked(top(v)), top(v));
      await backOut(ctx, 'menu');
    }
  },
  // Reversible writes through our own UI, each undone the same way and the undo checked (the runner's snapshot also
  // restores them if a step fails).
  {
    id: 'write-name',
    title: 'Rename the TV with our keyboard, then back',
    tvChecks: ['host-reads', 'device-name', 'ls-hubd-refuses'],
    writes: true,
    async run(ctx) {
      const name = await ctx.setting('deviceName');
      if (typeof name !== 'string') ctx.skip('the TV name is unreadable: ' + JSON.stringify(name));
      if (name.length >= 32) ctx.skip('the TV name is at its 32-character limit');
      const t0 = await ctx.tv.now();
      await openSettings(ctx, 'KeyboardInput');
      await toRow(ctx, 'menu', 'TV name');
      await ctx.key('ENTER', { text: true });
      let e = (await own(ctx, 'menu', (w) => !!w.editing, 'the keyboard')).editing;
      ctx.check('the keyboard opens on the TV\'s name', e.text === name, JSON.stringify(e.text) + ' vs ' + JSON.stringify(name));
      await typeKey(ctx, 'x');
      await own(ctx, 'menu', (w) => w.editing && w.editing.length === e.length + 1, 'the x typed');
      await ctx.capture('name-typed', { board: 'SmokeKeyboard', scene: 'KitForms' });
      await typeKey(ctx, 'Done');
      await own(ctx, 'menu', (w) => !w.editing, 'Done to close the keyboard');
      await written(ctx, 'the TV name is written as typed', 'deviceName', async () => (await ctx.setting('deviceName')) === name + 'x', t0);
      await toRow(ctx, 'menu', 'TV name');
      await ctx.key('ENTER', { text: true });
      e = (await own(ctx, 'menu', (w) => !!w.editing, 'the keyboard again')).editing;
      await typeKey(ctx, 'Delete');
      await own(ctx, 'menu', (w) => w.editing && w.editing.length === e.length - 1, 'the x erased');
      await typeKey(ctx, 'Done');
      await written(ctx, 'the TV name is back', 'deviceName', async () => (await ctx.setting('deviceName')) === name, t0);
      await backOut(ctx, 'menu');
    }
  },
  {
    // Quick Start+ only changes how the TV powers on from standby: while it is on, nothing on screen or in the sound
    // changes, and it goes back with the same press. (Auto volume would change the loudness of whatever plays.)
    id: 'write-toggle',
    title: 'Flip Quick Start+ in General, then back',
    tvChecks: ['host-reads', 'ls-hubd-refuses'],
    writes: true,
    async run(ctx) {
      const v0 = await ctx.setting('quickStartMode');
      if (v0 === undefined || v0 === 'unreadable') ctx.skip('Quick Start+ is unreadable');
      const t0 = await ctx.tv.now();
      await openSettings(ctx, 'General');
      await toRow(ctx, 'menu', 'Quick Start+');
      await ctx.key('ENTER', { write: { ref: 'quickStartMode' } });
      await written(ctx, 'Quick Start+ is flipped on the TV', 'quickStartMode', async () => (await ctx.setting('quickStartMode')) !== v0, t0);
      await ctx.capture('quick-start-flipped', { board: 'SmokeSettingsGeneral', scene: 'Settings' });
      await ctx.key('ENTER', { write: { ref: 'quickStartMode' } });
      await written(ctx, 'Quick Start+ is back', 'quickStartMode', async () => (await ctx.setting('quickStartMode')) === v0, t0);
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'write-picture-mode',
    title: 'Change Picture mode with the quick sheet\'s picker, then back',
    tvChecks: ['host-reads', 'ls-hubd-refuses'],
    writes: true,
    async run(ctx) {
      const pm = await ctx.setting('pictureMode');
      const t0 = await ctx.tv.now();
      await gear(ctx);
      await toRow(ctx, 'quick', 'Picture mode', 'UP');
      await ctx.key('ENTER');
      await own(ctx, 'quick', (v) => top(v) === 'pick:pictureMode', 'the Picture mode picker');
      const other = await toChoice(ctx, 'quick', (f) => f.kind === 'choose' && f.choice !== String(pm), 'other than ' + pm);
      await ctx.key('ENTER', { write: { ref: 'pictureMode' } });
      await written(ctx, 'Picture mode is ' + other.focus.choice + ' on the TV', 'pictureMode', async () => String(await ctx.setting('pictureMode')) === other.focus.choice, t0);
      await ctx.capture('picture-mode-changed', { board: 'SmokeQuickSettings', scene: 'QuickSheet' });
      await own(ctx, 'quick', (v) => top(v) === 'quick', 'the sheet after choosing');
      await ctx.key('ENTER');
      await own(ctx, 'quick', (v) => top(v) === 'pick:pictureMode', 'the picker again');
      await toChoice(ctx, 'quick', (f) => f.kind === 'choose' && f.choice === String(pm), String(pm));
      await ctx.key('ENTER', { write: { ref: 'pictureMode' } });
      await written(ctx, 'Picture mode is back', 'pictureMode', async () => (await ctx.setting('pictureMode')) === pm, t0);
      await backOut(ctx, 'quick');
    }
  },
  {
    id: 'write-volume-row',
    title: 'Step the quick sheet\'s Volume row, then back',
    tvChecks: ['volume-calls', 'ls-hubd-refuses'],
    writes: true,
    async run(ctx) {
      const v0 = await ctx.volume();
      if (v0.muted) ctx.skip('the TV is muted');
      const t0 = await ctx.tv.now();
      const [there, back] = v0.volume >= 100 ? ['LEFT', 'RIGHT'] : ['RIGHT', 'LEFT'];
      const d = there === 'RIGHT' ? 1 : -1;
      await gear(ctx);
      await toRow(ctx, 'quick', 'Volume');
      await ctx.key(there, { write: { ref: 'volume' } });
      await written(ctx, 'the Volume row steps the TV\'s volume', 'volume', async () => (await ctx.volume()).volume === v0.volume + d, t0);
      await ctx.capture('volume-row', { board: 'SmokeQuickSettings', scene: 'QuickSheet' });
      await ctx.key(back, { write: { ref: 'volume' } });
      await written(ctx, 'the volume is back', 'volume', async () => (await ctx.volume()).volume === v0.volume, t0);
      await backOut(ctx, 'quick');
    }
  },
  {
    id: 'reads',
    title: "The reads our Settings' adapters make, answered as root (shapes only; nothing is set)",
    tvChecks: ['hdmi-info', 'system-info', 'network-time', 'eula', 'telemetry', 'wifi-shape', 'bt-shape', 'pin-read', 'groups', 'groups-reads', 'wifi-groups'],
    async run(ctx) {
      const get = async (uri, p) => { try { return await ctx.luna(uri, p); } catch (e) { return { returnValue: false, errorText: e.message }; } };
      const fg = await ctx.foreground();
      const hdmi = await get('luna://com.webos.service.tv.display/getHDMIInfo', {});
      if (/hdmi/i.test(fg)) ctx.check('getHDMIInfo on ' + fg + ': width, height, frameRate, scanType', ['width', 'height', 'frameRate', 'scanType'].every((k) => hdmi[k] !== undefined), JSON.stringify(hdmi).slice(0, 200));
      else ctx.note('reads.hdmi', { fg, hdmi });
      const sys = await get('luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName', 'firmwareVersion', 'sdkVersion'] });
      ctx.check('getSystemInfo answers modelName and firmwareVersion', !!(sys.modelName && sys.firmwareVersion), JSON.stringify(sys).slice(0, 200));
      ctx.note('reads.system', { modelName: sys.modelName, firmwareVersion: sys.firmwareVersion, sdkVersion: sys.sdkVersion });
      const os = await get('luna://com.palm.systemservice/osInfo/query', { parameters: ['core_os_release'] });
      ctx.check('osInfo/query answers core_os_release', !!os.core_os_release, JSON.stringify(os).slice(0, 200));
      const nt = await get('luna://com.palm.systemservice/getPreferences', { keys: ['useNetworkTime'] });
      ctx.check('getPreferences answers useNetworkTime', nt.useNetworkTime !== undefined, JSON.stringify(nt).slice(0, 200));
      const eula = await get('luna://com.webos.settingsservice/getSystemSettings', { category: '', keys: ['eulaStatus'] });
      const keys = ['acrOnAllowed', 'acrAdAllowed', 'customAdAllowed', 'additionalDataAllowed', 'voiceAllowed', 'voice2Allowed', 'takeOnAllowed', 'chpAllowed'];
      const es = eula.settings && eula.settings.eulaStatus;
      ctx.check('eulaStatus has the eight agreements as booleans', !!es && keys.every((k) => typeof es[k] === 'boolean'), JSON.stringify(es || eula).slice(0, 300));
      const tel = await get('luna://dev.themepack.look.service/getTelemetry', {});
      ctx.check('getTelemetry answers a kit state', ['active', 'inactive', 'unknown'].includes(tel.kit), tel.kit);
      const wifi = await get('luna://com.webos.service.wifi/getstatus', {});
      ctx.note('reads.wifi', { status: wifi.status, returnValue: wifi.returnValue });
      ctx.check('wifi getstatus answers', wifi.returnValue !== false, JSON.stringify(wifi).slice(0, 200));
      const bt = await get('luna://com.webos.service.btaudiosrc/getPairedDevices', {});
      ctx.check('btaudiosrc getPairedDevices gives devices [{address, name}]', Array.isArray(bt.devices) && bt.devices.every((d) => d.address !== undefined && d.name !== undefined), JSON.stringify(bt).slice(0, 200));
      const perm = await ctx.tv.sh('cat /var/luna-service2-dev/client-permissions.d/dev.themepack.look.service.compositor.json');
      let groups = [];
      try { groups = JSON.parse(perm.stdout)['com.webos.surfacemanager.systemui'] || []; } catch (e) { /* none */ }
      ctx.note('reads.groups', groups);
      ctx.check('our compositor identity holds groups beyond our own', groups.length > 1, groups.join(' '));
    }
  },
  {
    id: 'look-app',
    title: "The Look app (Home's Look icon) opens our Settings at its Look page and leaves at once",
    tvChecks: ['look-app-launch', 'look-app-bus'],
    async run(ctx) {
      const want = landing('Look');
      const lines = Number((await ctx.tv.sh('wc -l < /var/log/messages 2>/dev/null')).stdout.trim()) || 0;
      await ctx.luna(SAM + '/launch', { id: 'dev.themepack.look' });
      const t0 = Date.now();
      const v = await own(ctx, 'menu', (w) => w.open && same(w.stack, want.stack), 'our Settings at ' + want.stack.join('/'));
      ctx.check('the Look app opens the Look page', top(v) === 'Look', v.stack.join('/'));
      await ctx.capture('look-app', { scene: 'Settings' });
      const left = await ctx.wait('the Look app to leave running', async () =>
        !((await ctx.luna(SAM + '/running', {})).running || []).some((a) => a.id === 'dev.themepack.look'), { timeout: 3000 }).then(() => Date.now() - t0, () => null);
      ctx.check('the Look app left running within 1 s of opening the page', left !== null && left <= 1000 + ctx.poll, left === null ? 'still running' : left + ' ms');
      const log = await ctx.tv.sh(lines ? 'tail -n +' + (lines + 1) + ' /var/log/messages | grep -i "dev.themepack.look" | grep -i -E "permission|denied|not allowed|not permitted"' : 'true');
      if (!lines) ctx.note('look-app.log', 'no /var/log/messages to read');
      ctx.check('no permission error for dev.themepack.look in /var/log/messages', !log.stdout.trim(), log.stdout.trim().split('\n').slice(0, 3).join(' | '));
      await backOut(ctx, 'menu');
    }
  },
  {
    id: 'redirect',
    title: "The Settings redirect: com.palm.app.settings through SAM opens ours, and nothing of LG's shows",
    tvChecks: ['sam-description', 'home-tile-launch', 'stub-leaves', 'unknown-target', 'relaunch', 'launch-while-open', 'deep-back', 'stub-resident'],
    async needs(ctx) {
      const m = await ctx.tv.sh('mount');
      return m.stdout.includes(' ' + SETTINGS_APP + ' ') ? null : 'the Settings stub is not mounted (deploy step boot): launching would open LG\'s Settings';
    },
    async run(ctx) {
      const why = await this.needs(ctx);
      if (why) ctx.skip(why);
      await noLgSettings(ctx, 'before any launch');
      const info = (await ctx.luna(SAM + '/getAppInfo', { id: 'com.palm.app.settings' })).appInfo || {};
      ctx.check('SAM serves the stub\'s description', info.vendor === 'theme-pack' && info.version === '1.0.0' && !info.usePrerendering, JSON.stringify({ vendor: info.vendor, version: info.version, usePrerendering: info.usePrerendering }));
      for (const t of [undefined, 'network', 'Bluetooth', 'Language', 'Location', 'NoSuchTarget']) {
        const want = landing(stubTarget(t));
        const frames = await burst(ctx, 'redirect-' + (t || 'none'), t === undefined ? {} : { target: t });
        const v = await own(ctx, 'menu', (w) => w.open && same(w.stack, want.stack), 'our Settings at ' + want.stack.join('/'));
        ctx.check((t || 'no target') + ' lands on ' + want.stack.join('/'), same(v.stack, want.stack) && v.area === want.area, v.stack.join('/') + ' ' + v.area);
        const late = frames.filter((f) => f.t >= 1);
        ctx.check((t || 'no target') + ': the stub left running within 1 s', late.length > 0 && late.every((f) => !f.running), frames.map((f) => f.t.toFixed(2) + 's ' + (f.running ? 'stub' : '-')).join(' '));
        // The stub may come to the front for a moment (it draws nothing); after 1 s it must be gone from there too.
        ctx.check((t || 'no target') + ': nothing of Settings in front after 1 s', late.every((f) => f.fg !== 'com.palm.app.settings'), frames.map((f) => f.fg).join(' '));
        await ctx.key('DOWN');
        await own(ctx, 'menu', (w) => w.open, 'keys still reach our Settings');
        await backOut(ctx, 'menu');
      }
      // A launch while ours is open does not reset it; two launches 100 ms apart end on the second.
      await ctx.luna(SAM + '/launch', { id: 'com.palm.app.settings', params: { target: 'network' } });
      const a = await own(ctx, 'menu', (w) => w.open && top(w) === landing('Network').stack.slice(-1)[0], 'Settings at Network');
      await ctx.luna(SAM + '/launch', { id: 'com.palm.app.settings', params: { target: 'network' } });
      await ctx.sleep(1500);
      const b = (await ctx.settings()).menu;
      ctx.check('a second launch to the same page leaves it open there', b.open && same(b.stack, a.stack), b.stack.join('/'));
      await backOut(ctx, 'menu');
      await ctx.tv.sh("luna-send -n 1 -w 5000 " + SAM + "/launch '{\"id\":\"com.palm.app.settings\",\"params\":{\"target\":\"network\"}}' </dev/null >/dev/null & { sleep 0.1 2>/dev/null || usleep 100000; }; " +
        "luna-send -n 1 -w 5000 " + SAM + "/launch '{\"id\":\"com.palm.app.settings\",\"params\":{\"target\":\"Language\"}}' </dev/null >/dev/null; wait");
      const want = landing(stubTarget('Language'));
      const c = await own(ctx, 'menu', (w) => w.open && same(w.stack, want.stack), 'the second target').catch((e) => null);
      ctx.check('two launches 100 ms apart end on the second target', !!c, want.stack.join('/'));
      // After a deep link, Back goes one page back, then to the categories, then closed.
      await backOut(ctx, 'menu');
      await openViaSam(ctx, 'AboutThisTV');
      const steps = await backOut(ctx, 'menu');
      ctx.check('Back from a deep link steps back page by page', steps >= 2, steps + ' Backs');
      await ctx.sleep(1000);
      await noLgSettings(ctx, 'after Back');
      ctx.check('Back did not reopen our Settings', !(await ctx.settings()).menu.open);
    }
  },
  {
    id: 'redirect-all',
    title: 'Every LG deep-link target lands on its page',
    tvChecks: ['deep-links-all'],
    async run(ctx) {
      const why = await SCENARIOS.find((s) => s.id === 'redirect').needs(ctx);
      if (why) ctx.skip(why);
      for (const t of Object.keys(catalog.lgTargets.map)) {
        const want = landing(stubTarget(t));
        await ctx.luna(SAM + '/launch', { id: 'com.palm.app.settings', params: { target: t } });
        const v = await own(ctx, 'menu', (w) => w.open && same(w.stack, want.stack), t + ' at ' + want.stack.join('/')).catch(() => null);
        const got = v || (await ctx.settings()).menu;
        ctx.check(t + ' -> ' + want.stack.join('/'), !!v, got.stack ? got.stack.join('/') : 'closed');
        await backOut(ctx, 'menu');
      }
    }
  },
  {
    id: 'theme-swap',
    title: 'A theme swap while each surface is open',
    tvChecks: [],
    async run(ctx) {
      const look0 = await ctx.look();
      const other = same(look0, SWAP) ? { style: 'smoke', themes: ['halloween'] } : SWAP;
      async function swap(name, board, scene) {
        await ctx.setLook(other);
        await ctx.wait('the swapped look', async () => same(await ctx.look(), other));
        await ctx.sleep(500);
        await ctx.capture(name + '-swapped', { board, scene });
        await ctx.setLook(look0);
        await ctx.wait('the look back', async () => same(await ctx.look(), look0));
        await ctx.sleep(500);
        await ctx.capture(name + '-back', { board, scene });
      }
      await gear(ctx);
      await swap('sheet', 'SmokeQuickSettings', 'QuickSheet');
      ctx.check('the sheet stayed open through the swap', (await ctx.settings()).quick.open);
      await backOut(ctx, 'quick');
      await openSettings(ctx, 'Sound');
      await swap('settings', 'SmokeSettingsSound', 'Settings');
      ctx.check('Settings stayed on Sound through the swap', top((await ctx.settings()).menu) === 'Sound');
      await backOut(ctx, 'menu');
      const st = await ctx.state();
      if (st.systemUi === '' && !(st.picker && st.picker.shown)) {
        await ctx.luna(SYSUI + '/launch', { appId: PICKER });
        await ctx.wait('our input picker', async () => { const s = await ctx.state(); return !!(s.picker && s.picker.shown); });
        await swap('picker', 'SmokeInputPicker', 'InputPicker');
        await ctx.key('BACK');
        await ctx.wait('the picker to close', async () => { const s = await ctx.state(); return !(s.picker && s.picker.shown); });
      }
      const message = 'TV suite swap ' + Date.now();
      await ctx.luna('luna://com.webos.notification/createToast', { sourceId: 'dev.themepack.look', message });
      await ctx.wait('our toast', async () => { const s = await ctx.state(); return !!(s.toast && s.toast.shown); });
      await ctx.setLook(other);
      await ctx.wait('the swapped look', async () => same(await ctx.look(), other));
      await ctx.capture('toast-swapped', { board: 'SmokeOverlays', scene: 'Toast' });
      await ctx.setLook(look0);
      ctx.check('the look restored', same(await ctx.look(), look0));
    }
  }
];

async function openViaSam(ctx, t) {
  const want = landing(stubTarget(t));
  await ctx.luna(SAM + '/launch', { id: 'com.palm.app.settings', params: { target: t } });
  return own(ctx, 'menu', (w) => w.open && same(w.stack, want.stack), 'Settings at ' + want.stack.join('/'));
}

// Launches LG's Settings app id through SAM while the TV captures its output and samples the app in front and
// whether the stub runs, back to back for ~2 s, on the TV itself (one ssh call, so the samples are not paced by
// round trips). Returns [{ t (s since the launch), fg, running, file }].
async function burst(ctx, name, params) {
  const d = '/tmp/tv-suite-burst', n = 8;
  const launch = JSON.stringify({ id: 'com.palm.app.settings', params });
  const cmd = [
    'd=' + d + '; rm -rf $d; mkdir -p $d; t0=$(cut -d" " -f1 /proc/uptime)',
    '(i=0; while [ $i -lt ' + n + ' ]; do',
    ' luna-send -n 1 -w 3000 luna://com.webos.surfacemanager/captureCompositorOutput "{\\"output\\":\\"$d/f$i.png\\",\\"format\\":\\"PNG\\"}" </dev/null >/dev/null 2>&1;',
    ' fg=$(luna-send -n 1 -w 2000 luna://com.webos.applicationManager/getForegroundAppInfo "{}" </dev/null | sed -n "s/.*\\"appId\\":\\"\\([^\\"]*\\)\\".*/\\1/p");',
    ' run=$(luna-send -n 1 -w 2000 luna://com.webos.applicationManager/running "{}" </dev/null | grep -c "\\"com.palm.app.settings\\"");',
    ' echo "$i $(cut -d" " -f1 /proc/uptime) $t0 ${fg:--} $run" >> $d/log; i=$((i + 1)); done) &',
    'luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch \'' + launch.replace(/'/g, "'\\''") + '\' </dev/null >/dev/null 2>&1',
    'wait; cat $d/log'
  ].join('\n');
  const r = await ctx.tv.sh(cmd, { timeout: 60000 });
  const frames = [];
  for (const l of r.stdout.split('\n')) {
    const m = l.trim().split(/\s+/);
    if (m.length < 5) continue;
    const local = await ctx.capturePulled(name + '-f' + m[0], d + '/f' + m[0] + '.png');
    frames.push({ t: Number(m[1]) - Number(m[2]), fg: m[3], running: Number(m[4]) > 0, file: local });
  }
  ctx.must(name + ': frames sampled', frames.length > 0, r.stderr.trim());
  return frames;
}
