// The checks that need a person at the TV, as one ordered pass. For each: what to press, what to look for, what counts
// as a pass. While the person presses, the suite watches our parts' probes, the system UI and the app in front, and
// logs what it saw; it drives what it can itself (opening a deep link first, breaking the layer on purpose and
// putting it back) and asserts what it can see. The person gives the verdict: p (pass), f (fail) or s (skip), then
// an optional note.
import { closeAll, runScenarios } from './run.mjs';
import { SCENARIOS } from './scenarios.mjs';
import { landing, stubTarget } from './expect.mjs';
import { breakLayer, rerunHook, mounted, restoreLayer, removeStub, installStub } from './fallbacks.mjs';

const SAM = 'luna://com.webos.applicationManager';

async function deepLink(ctx, t) {
  const want = landing(stubTarget(t));
  await ctx.luna(SAM + '/launch', { id: 'com.palm.app.settings', params: { target: t } });
  await ctx.wait('Settings at ' + want.stack.join('/'), async () => { const m = (await ctx.settings()).menu; return !!(m.open && JSON.stringify(m.stack) === JSON.stringify(want.stack)); });
}
const scenarios = (ids) => SCENARIOS.filter((s) => ids.includes(s.id));

export const CHECKLIST = [
  { group: '1. The Home screen and the Settings tile', items: [
    { id: 'home-tile', covers: ['home-tile', 'home-tile-launch'],
      press: 'Press HOME. Look at the Settings tile, then open it.',
      look: "The tile shows a Settings icon, not the Look app's. Our Settings opens at its top with focus in the categories. Before it, nothing of LG's Settings shows: no splash, no blank or black frame, no spinner.",
      pass: 'Settings icon on the tile, and only our Settings ever on screen.',
      check: (saw) => saw.some((l) => /settings Picture categories/.test(l.what)) },
    { id: 'picture-blink', covers: ['picture-blink'],
      press: 'On Live TV, open the Settings tile again and close it with BACK. Then switch to an HDMI input yourself and do the same.',
      look: 'The picture underneath, while our Settings opens and closes.',
      pass: 'The picture never blinks, freezes or reloads, on Live TV and on HDMI.' },
    { id: 'real-callers', covers: ['real-callers'],
      press: "Where your TV shows them, follow LG's own routes into Settings: Home's network hint, Bluetooth surround in Home's connections, the on-screen keyboard's voice-language link, the live menu's zip-code guide. Close Settings with BACK after each.",
      look: 'Which page our Settings opens on each time (the suite logs it).',
      pass: 'Network, Bluetooth, Language and Location pages, each from its route.' },
    { id: 'exit', covers: ['exit-home'],
      before: (ctx) => deepLink(ctx, 'AboutThisTV'),
      press: 'The suite has opened our Settings at About this TV. Press EXIT.',
      look: 'Settings closes, as it does from the top.', pass: 'Closed at once, nothing else opens.',
      check: (saw, ctx, end) => !end.includes('settings ') },
    { id: 'home', covers: ['exit-home'],
      before: (ctx) => deepLink(ctx, 'AboutThisTV'),
      press: 'The suite has opened our Settings at About this TV again. Press HOME.',
      look: 'Settings closes and Home shows.', pass: 'Settings gone, Home on screen, no Settings left behind.',
      check: (saw, ctx, end) => !end.includes('settings ') && !end.includes('stub running') },
    { id: 'back-refusing-app', covers: ['back-refusing-app'],
      press: 'Open an app such as a streaming app. Open our Settings with the gear, then All settings. Press BACK until Settings closes.',
      look: 'Whether Settings closes and LG goes Home (the suite logs the app in front).',
      pass: 'Settings closes; Home opens or the app stays; no Settings window is left.',
      check: (saw, ctx, end) => !end.includes('stub running') }
  ] },
  { group: '2. Remote buttons and the pointer', items: [
    { id: 'gear-held', covers: ['gear-closes'],
      press: 'Hold the gear button for two seconds, then let go.',
      look: 'The quick sheet opens once and stays open.', pass: 'No flicker open and shut.',
      check: (saw) => saw.filter((l) => /sheet quick/.test(l.what) && !/sheet quick/.test(l.was)).length === 1 },
    { id: 'hotkeys', covers: ['hotkeys'],
      press: "If your remote (or its on-screen remote) has the picture-mode and sleep hotkeys, press each, and BACK out of what opens.",
      look: 'The quick sheet opens with the Picture mode picker, and with the Sleep timer picker.', pass: 'Each lands on its picker; nothing changes.' },
    { id: 'pointer', covers: ['pointer'],
      press: 'Shake the magic remote to show the pointer. Open the gear sheet, move the pointer over its rows, click Picture mode, then press BACK twice.',
      look: 'Focus follows the pointer; the click opens the picker.', pass: 'Rows follow the pointer and a click opens the picker; no value changes.' },
    { id: 'screen-off', covers: ['volume-calls'],
      press: 'In the gear sheet, move to Screen off and press OK. Wait a few seconds, then press any button.',
      look: 'The panel goes dark while the sound plays on; a button wakes it.', pass: 'Dark with sound, back on at a press.' },
    { id: 'channel-keys', covers: ['focus-chain'],
      press: 'Over Live TV, open the gear sheet and close it with BACK, then press CH+ and CH-.',
      look: 'The channel keys work straight after the sheet closes.', pass: 'The channel changes at the first press.' },
    { id: 'leave-for-lg', covers: ['device-connector'],
      press: "Open Settings, Connection, Device connector and press OK, then BACK. Then Support, Picture test: OK, BACK. Then Sound test: OK, BACK.",
      look: "LG's connection wizard, and LG's support app at each test (the suite logs the app in front); where BACK lands.",
      pass: 'Each opens; BACK comes back to our Settings or somewhere sensible.' }
  ] },
  { group: '3. Back on each kind of input (the suite repeats its Back checks)', items: [
    { id: 'back-live', covers: ['back-rule'],
      press: 'Switch to Live TV yourself, then answer here to start: the suite runs its quick sheet and Picture mode scenarios.',
      look: 'Nothing; the suite checks one page back, then closed.', pass: 'Both scenarios pass.',
      auto: async (ctx) => (await runScenarios(ctx, scenarios(['quick-sheet', 'picture-mode']))).runs.every((r) => r.status === 'pass') },
    { id: 'back-hdmi', covers: ['back-rule'],
      press: 'Switch to an HDMI input yourself, then answer here to start the same scenarios.',
      look: 'Nothing; the suite checks.', pass: 'Both scenarios pass.',
      auto: async (ctx) => (await runScenarios(ctx, scenarios(['quick-sheet', 'picture-mode']))).runs.every((r) => r.status === 'pass') }
  ] },
  { group: '4. Fallbacks: the suite breaks our layer on purpose and puts it back', items: [
    { id: 'layer-broken', covers: ['stub-left-stock'],
      before: async (ctx) => {
        await breakLayer(ctx, 'layer');
        const log = await rerunHook(ctx);
        ctx.check('with the layer broken, the hook leaves LG\'s Settings', /settings left stock \(our Settings host never reported ready\)/.test(log), log.trim().split('\n').pop());
        ctx.check('and nothing is mounted over it', !(await mounted(ctx)));
      },
      press: "Our layer is broken on purpose now. Press HOME and open the Settings tile, then close LG's Settings with BACK or EXIT.",
      look: "LG's own Settings opens (that is the fallback).", pass: "LG's Settings opens and closes normally.",
      after: (ctx) => restoreLayer(ctx) },
    { id: 'part-removed', covers: ['part-removed', 'qs-entry'],
      before: async (ctx) => {
        const { t0 } = await breakLayer(ctx, 'part');
        await ctx.key('QMENU');
        const st = await ctx.wait("LG's Quick Settings", async () => { const s = await ctx.state(); return s.systemUi === 'com.webos.app.quicksettings' ? s : null; }).catch(() => null);
        ctx.check('without our Settings part the gear opens LG\'s Quick Settings', !!st);
        await ctx.capture('lg-quick-settings', {});
        const rs = await ctx.tv.reports(t0);
        ctx.note('partRemoved.reports', rs.map((x) => x.kind + ' ' + x.text));
      },
      press: "LG's Quick Settings is open (our Settings part is removed on purpose). Move with Up/Down, open a picker and press BACK without changing it, then open All Settings and press BACK.",
      look: "LG's Quick Settings works: rows, pickers, Back. All Settings may open nothing (the stub has no host now): note what it does.",
      pass: "LG's Quick Settings works fully.",
      after: async (ctx) => {
        const st = await ctx.state();
        if (st.systemUi === 'com.webos.app.quicksettings') await ctx.key('BACK');
        await restoreLayer(ctx);
      } },
    { id: 'stub-removed', covers: ['stub-remove'],
      before: async (ctx) => { await removeStub(ctx); ctx.check('install-boot.sh remove unmounts the stub', !(await mounted(ctx))); },
      press: "The stub is removed. Press HOME, open the Settings tile, then close LG's Settings.",
      look: "LG's Settings opens, without a reboot.", pass: "LG's Settings opens.",
      after: async (ctx) => { await installStub(ctx); ctx.check('the stub is back', await mounted(ctx)); } }
  ] },
  { group: '5. Later, and decisions', items: [
    { id: 'gear-after-an-hour', covers: ['gear-opens'], later: true,
      press: 'After the TV has been on for an hour: node tools/theme-pack/tv-suite/tv-suite.mjs run OUT --scenario quick-sheet',
      look: 'The scenario result.', pass: 'It passes: the gear still opens our sheet.' },
    { id: 'hdmi-change', covers: ['hdmi-info'], later: true,
      press: "Change the HDMI source's resolution or frame rate, then open the gear sheet.",
      look: 'The subtitle, e.g. "HDMI 2 · 4K · 120 Hz".', pass: 'It follows the new signal.' },
    { id: 'telemetry-revert', covers: ['telemetry'], later: true,
      press: "Optional, with tools/telemetry-off: run its revert, then: luna-send -n 1 luna://dev.themepack.look.service/getTelemetry '{}'; re-apply it afterwards.",
      look: 'kit', pass: '"inactive" after the revert, "active" again after re-applying and a boot.' },
    { id: 'decisions', covers: ['pin-no-limit', 'input-locks', 'app-locks'], later: true,
      press: 'Owner decisions and research, nothing to press: a limit on wrong PIN tries; the lockable-input list and the app-lock call for the pages still to build.',
      look: '-', pass: 'Decided, or recorded as still open.' }
  ] }
];

export function printChecklist(say) {
  let n = 0;
  for (const g of CHECKLIST) {
    say('\n' + g.group);
    for (const it of g.items) {
      n++;
      say('  ' + n + '. [' + it.id + ']' + (it.before ? ' (the suite prepares this step)' : '') + (it.auto ? ' (the suite runs this step)' : ''));
      say('     press: ' + it.press);
      say('     look:  ' + it.look);
      say('     pass:  ' + it.pass);
    }
  }
}

// One line for what the TV shows, from the probes, the system UI, SAM and the app in front.
async function summary(ctx) {
  const st = await ctx.state();
  const s = st.settings || {}, m = s.menu || {}, q = s.quick || {};
  let fg = '', stub = false;
  try { fg = await ctx.foreground(); } catch (e) { fg = '?'; }
  try { stub = ((await ctx.luna(SAM + '/running', {})).running || []).some((a) => a.id === 'com.palm.app.settings'); } catch (e) { /* unknown */ }
  return [m.open ? 'settings ' + (m.stack || []).join('/') + ' ' + m.area + (m.focus ? ' @' + m.focus.label : '') : '',
    q.open ? 'sheet ' + (q.stack || []).join('/') + (q.focus ? ' @' + q.focus.label : '') : '',
    st.systemUi ? 'system UI ' + st.systemUi : '', st.picker && st.picker.shown ? 'input picker' : '',
    stub ? 'stub running' : '', 'front ' + fg].filter(Boolean).join(' | ');
}

// Runs the pass. `answer(question)` returns the person's line ("p", "f note", "s"...). `only` picks item ids.
export async function manual(ctx, { answer, only, includeLater = true, watchEvery } = {}) {
  const results = [];
  for (const g of CHECKLIST) {
    for (const it of g.items) {
      if (only && !only.includes(it.id)) continue;
      if (it.later && !includeLater) continue;
      ctx.scenario = { id: 'manual-' + it.id };
      const rec = ctx.current = { id: it.id, covers: it.covers, checks: [], captures: [], keys: [], saw: [], verdict: '', note: '' };
      results.push(rec);
      ctx.say('\n' + g.group + ' / ' + it.id);
      try {
        if (!it.later) await closeAll(ctx);
        if (it.before) await it.before(ctx);
      } catch (e) { ctx.check('prepare ' + it.id, false, e.message); }
      ctx.say('  press: ' + it.press + '\n  look:  ' + it.look + '\n  pass:  ' + it.pass);
      // Watch until the person answers.
      let answered = false, last = '';
      const t0 = Date.now();
      const watch = (async () => {
        while (!answered && !it.later) {
          let now = '';
          try { now = await summary(ctx); } catch (e) { now = 'unreadable: ' + e.message; }
          if (now !== last) { rec.saw.push({ t: Math.round((Date.now() - t0) / 100) / 10, what: now, was: last }); ctx.say('  saw ' + now); last = now; }
          await ctx.sleep(watchEvery || ctx.poll * 2);
        }
      })();
      let line = '';
      if (it.auto) {
        await answer('  answer anything to start: ');
        const ok = await it.auto(ctx).catch((e) => { ctx.check(it.id, false, e.message); return false; });
        ctx.scenario = { id: 'manual-' + it.id };
        ctx.current = rec;
        line = ok ? 'p' : 'f the suite\'s scenarios failed';
      } else line = String(await answer('  verdict [p/f/s] and a note: ') || 's');
      answered = true;
      await watch;
      rec.verdict = { p: 'pass', f: 'fail', s: 'skip' }[line.trim().charAt(0).toLowerCase()] || 'skip';
      rec.note = line.trim().slice(1).trim();
      if (it.check && rec.verdict === 'pass') {
        const seen = it.check(rec.saw, ctx, last);
        ctx.check(it.id + ': what the suite saw agrees', seen, seen ? '' : 'the log above does not show it');
      }
      try { if (it.after) await it.after(ctx); } catch (e) { ctx.check('put back after ' + it.id, false, e.message); }
      if (rec.checks.some((c) => !c.ok) && rec.verdict === 'pass') rec.verdict = 'fail';
      ctx.say('  -> ' + rec.verdict + (rec.note ? ': ' + rec.note : ''));
    }
  }
  return results;
}
