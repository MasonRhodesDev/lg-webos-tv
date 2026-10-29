// The checks that need a person at the TV, as one ordered pass. For each: what to press, what to look for, what counts
// as a pass. While the person presses, the suite watches our parts' probes, the system UI and the app in front, and
// logs what it saw; it drives what it can itself (opening a deep link first, breaking the layer on purpose and
// putting it back) and asserts what it can see. The person gives the verdict: p (pass), f (fail) or s (skip), then
// an optional note.
import { closeAll, runScenarios, baseline, finish, probingUp } from './run.mjs';
import * as journal from './journal.mjs';
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

// The Back scenarios on whatever input the person chose: the runner restores the foreground to that input meanwhile,
// not to the baseline's (the person puts the baseline's back afterwards, and the suite checks).
async function onInputInFront(ctx) {
  ctx.foregroundOverride = await ctx.foreground();
  try { return (await runScenarios(ctx, scenarios(['quick-sheet', 'picture-mode']))).runs.every((r) => r.status === 'pass'); }
  finally { ctx.foregroundOverride = null; }
}

export class StopPass extends Error {}

// After a step the person changed something for (the input, the screen, the channel): the suite checks it is back,
// and asks again while it is not.
async function personRestored(ctx, it, answer) {
  const want = ctx.journal.baseline.foreground;
  if (it.restores === 'input') {
    for (let i = 0; i < 3; i++) {
      await ctx.sleep(1000);
      const fg = await ctx.foreground().catch(() => '?');
      if (fg === want) { ctx.check('the input is back on ' + want, true); return; }
      await answer('  The TV is on ' + fg + ', not ' + want + '. Put it back on ' + want + ', then answer: ');
    }
    ctx.check('the input is back on ' + want, false, 'still on ' + (await ctx.foreground().catch(() => '?')));
  } else if (it.restores === 'screen') {
    const p = await ctx.luna('luna://com.webos.service.tvpower/power/getPowerState', {}).catch(() => null);
    if (p && typeof p.state === 'string') { ctx.check('the screen is on again (getPowerState)', p.state === 'Active', p.state); return; }
    const a = String(await answer('  The suite cannot read the screen state. Is the screen on again? [y/n]: ') || '');
    ctx.check('the screen is on again (confirmed by the person)', /^y/i.test(a.trim()), a.trim());
  } else if (it.restores === 'channel') {
    const a = String(await answer('  Is the TV back on the channel it was on? [y/n]: ') || '');
    ctx.check('the channel is back (confirmed by the person; the suite cannot read it)', /^y/i.test(a.trim()), a.trim());
    await personRestored(ctx, { restores: 'input' }, answer);
  }
}

export const CHECKLIST = [
  { group: '1. The Home screen and the Settings tile', items: [
    { id: 'home-tile', restores: 'input', covers: ['home-tile', 'home-tile-launch', 'look-app-launch'],
      press: 'Press HOME. Look at the Settings tile and the Look tile, then open Settings; close it with BACK, then open Look.',
      look: "The Settings tile shows a Settings icon, the Look tile the Look icon. Settings opens our Settings at its top with focus in the categories; Look opens our Settings at its Look page. Before either, nothing else shows: no splash, no blank or black frame, no spinner, and the picture does not change.",
      pass: 'The right icon on each tile, and only our Settings ever on screen.',
      check: (saw) => saw.some((l) => /settings Picture categories/.test(l.what)) },
    { id: 'picture-blink', restores: 'input', covers: ['picture-blink'],
      press: 'On Live TV, open the Settings tile again and close it with BACK. Then switch to an HDMI input yourself and do the same. Afterwards, put the TV back on the input it was on (the suite checks).',
      look: 'The picture underneath, while our Settings opens and closes.',
      pass: 'The picture never blinks, freezes or reloads, on Live TV and on HDMI.' },
    { id: 'real-callers', restores: 'input', covers: ['real-callers'],
      press: "Where your TV shows them, follow LG's own routes into Settings: Home's network hint, Bluetooth surround in Home's connections, the on-screen keyboard's voice-language link, the live menu's zip-code guide. Close Settings with BACK after each.",
      look: 'Which page our Settings opens on each time (the suite logs it).',
      pass: 'Network, Bluetooth, Language and Location pages, each from its route.' },
    { id: 'exit', restores: 'input', covers: ['exit-home'],
      before: (ctx) => deepLink(ctx, 'AboutThisTV'),
      press: 'The suite has opened our Settings at About this TV. Press EXIT.',
      look: 'Settings closes, as it does from the top.', pass: 'Closed at once, nothing else opens.',
      check: (saw, ctx, end) => !end.includes('settings ') },
    { id: 'home', restores: 'input', covers: ['exit-home'],
      before: (ctx) => deepLink(ctx, 'AboutThisTV'),
      press: 'The suite has opened our Settings at About this TV again. Press HOME.',
      look: 'Settings closes and Home shows.', pass: 'Settings gone, Home on screen, no Settings left behind.',
      check: (saw, ctx, end) => !end.includes('settings ') && !end.includes('stub running') },
    { id: 'back-refusing-app', restores: 'input', covers: ['back-refusing-app'],
      press: 'Open an app such as a streaming app. Open our Settings with the gear, then All settings. Press BACK until Settings closes.',
      look: 'Whether Settings closes and LG goes Home (the suite logs the app in front).',
      pass: 'Settings closes; Home opens or the app stays; no Settings window is left.',
      check: (saw, ctx, end) => !end.includes('stub running') }
  ] },
  { group: '2. Remote buttons and the pointer', items: [
    { id: 'gear-held', covers: ['gear-closes'],
      press: 'Hold the gear button for two seconds, then let go.',
      look: 'The quick sheet opens once and stays open. (The suite samples about twice a second, so a shorter flicker is yours to see.)', pass: 'No flicker open and shut.',
      check: (saw) => saw.filter((l) => /sheet quick/.test(l.what) && !/sheet quick/.test(l.was)).length === 1 },
    { id: 'hotkeys', covers: ['hotkeys'],
      press: "If your remote (or its on-screen remote) has the picture-mode and sleep hotkeys, press each, and BACK out of what opens.",
      look: 'The quick sheet opens with the Picture mode picker, and with the Sleep timer picker.', pass: 'Each lands on its picker; nothing changes.' },
    { id: 'picker-move', covers: [],
      before: async (ctx) => {
        const st = await ctx.state();
        if (st.systemUi !== '') throw new Error('systemUIManager does not confirm nothing is open (' + st.systemUi + '): the picker is not launched');
        await ctx.luna('luna://com.webos.service.systemUIManager/launch', { appId: 'com.webos.app.quickinputpicker' });
      },
      press: 'The suite has opened the input picker. Move with LEFT and RIGHT; never press OK; close it with BACK.',
      look: 'Our tiles follow the focus; the current input keeps its mark.', pass: 'Focus moves; BACK closes it; the input does not change.',
      after: async (ctx) => {
        const st = await ctx.state();
        if (st.systemUi === 'com.webos.app.quickinputpicker' || (st.picker && st.picker.shown)) await ctx.luna('luna://com.webos.service.systemUIManager/closeByAppId', { id: 'com.webos.app.quickinputpicker' });
      } },
    { id: 'pointer', covers: ['pointer'],
      press: 'Shake the magic remote to show the pointer. Open the gear sheet, move the pointer over its rows, click Picture mode, then press BACK twice.',
      look: 'Focus follows the pointer; the click opens the picker.', pass: 'Rows follow the pointer and a click opens the picker; no value changes.' },
    { id: 'screen-off', restores: 'screen', covers: ['volume-calls'],
      press: 'In the gear sheet, move to Screen off and press OK. Wait a few seconds, then press any button: you restore the screen (the suite checks it is on).',
      look: 'The panel goes dark while the sound plays on; a button wakes it.', pass: 'Dark with sound, back on at a press.' },
    { id: 'channel-keys', restores: 'channel', covers: ['focus-chain'],
      press: 'Over Live TV, open the gear sheet and close it with BACK, then press CH+ and CH-: CH- puts you back on the channel you were on. Afterwards, put the TV back on the input it was on.',
      look: 'The channel keys work straight after the sheet closes.', pass: 'The channel changes at the first press.' },
    { id: 'leave-for-lg', restores: 'input', covers: ['device-connector'],
      press: "Open Settings, Connection, Device connector and press OK, then BACK. Then Support, Picture test: OK, BACK. Then Sound test: OK, BACK.",
      look: "LG's connection wizard, and LG's support app at each test (the suite logs the app in front); where BACK lands.",
      pass: 'Each opens; BACK comes back to our Settings or somewhere sensible.' }
  ] },
  { group: '3. Back on each kind of input (the suite repeats its Back checks)', items: [
    { id: 'back-live', restores: 'input', covers: ['back-rule'],
      press: 'Switch to Live TV yourself, then answer here to start: the suite runs its quick sheet and Picture mode scenarios there. Afterwards you put the input back (the suite checks).',
      look: 'Nothing; the suite checks one page back, then closed.', pass: 'Both scenarios pass.',
      auto: (ctx) => onInputInFront(ctx) },
    { id: 'back-hdmi', restores: 'input', covers: ['back-rule'],
      press: 'Switch to an HDMI input yourself, then answer here to start the same scenarios. Afterwards you put the input back (the suite checks).',
      look: 'Nothing; the suite checks.', pass: 'Both scenarios pass.',
      auto: (ctx) => onInputInFront(ctx) }
  ] },
  { group: '4. Fallbacks: the suite breaks our layer on purpose and puts it back', items: [
    // `fallback` marks the journal before the break, and the pass does not go on until the good layer is verified back.
    { id: 'layer-broken', covers: ['stub-left-stock'], fallback: 'layer',
      before: async (ctx) => {
        await breakLayer(ctx, 'layer');
        const log = await rerunHook(ctx);
        ctx.check('with the layer broken, the hook leaves LG\'s Settings', /settings left stock \(our Settings host never reported ready\)/.test(log), log.trim().split('\n').pop());
        ctx.check('and nothing is mounted over it', !(await mounted(ctx)));
      },
      press: "Our layer is broken on purpose now. Press HOME and open the Settings tile, then close LG's Settings with BACK or EXIT.",
      look: "LG's own Settings opens (that is the fallback).", pass: "LG's Settings opens and closes normally." },
    { id: 'part-removed', covers: ['part-removed', 'qs-entry'], fallback: 'layer',
      before: async (ctx) => {
        const { t0 } = await breakLayer(ctx, 'part');
        ctx.note('partRemoved.reports', (await ctx.tv.reports(t0)).map((x) => x.kind + ' ' + x.text));
      },
      press: "Our Settings part is removed on purpose (the suite presses nothing now). Press the gear: LG's Quick Settings should open. Move with Up/Down, open a picker and press BACK without changing it, then open All Settings and press BACK, then close it.",
      look: "LG's Quick Settings opens and works: rows, pickers, Back. All Settings may open nothing (the stub has no host now): note what it does.",
      pass: "LG's Quick Settings works fully.",
      check: (saw) => saw.some((l) => /system UI com\.webos\.app\.quicksettings/.test(l.what)) },
    { id: 'stub-removed', covers: ['stub-remove'], fallback: 'stub',
      before: async (ctx) => { await removeStub(ctx); ctx.check('install-boot.sh remove unmounts the stub', !(await mounted(ctx))); },
      press: "The stub is removed. Press HOME, open the Settings tile, then close LG's Settings.",
      look: "LG's Settings opens, without a reboot.", pass: "LG's Settings opens." }
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
    { id: 'bluetooth', covers: ['bt2-status', 'bt-remote-hidden', 'bt-actions'], later: true,
      press: "With a Bluetooth speaker of the household's at hand: open Settings > Connection > Bluetooth devices. Turn the speaker on, then off. Search, pair it, disconnect it, connect it again; forget it only if you are happy to pair it again.",
      look: 'The device rows, their values and the toasts.',
      pass: 'The speaker shows Connected while it is on and plays; the magic remote is never listed and is not in "N paired"; each action does what it says, or rolls back with a toast.' },
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
export async function manual(ctx, { answer, only, includeLater = true, watchEvery, results = [] } = {}) {
  ctx.tv.resetKeys();
  await probingUp(ctx);
  await ctx.tv.ensureKeys();
  const owned = await baseline(ctx);
  try {
    await pass(ctx, results, { answer, only, includeLater, watchEvery });
  } finally {
    if (!ctx.aborted) {
      ctx.scenario = { id: 'manual-end' };
      ctx.current = { checks: [], captures: [], keys: [] };
      const r = await finish(ctx, owned);
      results.end = ctx.current.checks;
      ctx.check('the TV is back to the baseline, read back', !r.left.length, r.left.join('; '));
    }
  }
  return results;
}

async function pass(ctx, results, { answer, only, includeLater, watchEvery }) {
  for (const g of CHECKLIST) {
    for (const it of g.items) {
      if (only && !only.includes(it.id)) continue;
      if (it.later && !includeLater) continue;
      ctx.scenario = { id: 'manual-' + it.id };
      const rec = ctx.current = { id: it.id, covers: it.covers, checks: [], captures: [], keys: [], saw: [], verdict: '', note: '' };
      results.push(rec);
      ctx.say('\n' + g.group + ' / ' + it.id);
      if (it.fallback === 'layer') journal.mark(ctx.journal, { layer: 'broken' });
      if (it.fallback === 'stub') journal.mark(ctx.journal, { stub: 'removed' });
      try {
        try {
          if (!it.later) { const why = await closeAll(ctx); if (why) throw new Error(why); }
          if (it.before) await it.before(ctx);
        } catch (e) { ctx.check('prepare ' + it.id, false, e.message); }
        await ask(ctx, it, rec, { answer, watchEvery });
        if (it.restores && !it.later) await personRestored(ctx, it, answer);
        if (it.after) await it.after(ctx);
      } catch (e) {
        if (e instanceof StopPass) throw e;
        ctx.check('step ' + it.id, false, e.message);
      } finally {
        if (!ctx.aborted) await putBack(ctx, it);
      }
      if (rec.checks.some((c) => !c.ok) && rec.verdict === 'pass') rec.verdict = 'fail';
      ctx.say('  -> ' + rec.verdict + (rec.note ? ': ' + rec.note : ''));
    }
  }
}

// A fallback is undone before anything else happens: the good layer verified back (retried), or the stub mounted
// again. If that fails the pass stops, loudly, and the journal stays open for the next command to finish it.
async function putBack(ctx, it) {
  if (it.fallback === 'layer') {
    const why = await restoreLayer(ctx);
    if (why) throw new StopPass('STOP: the good layer could not be put back after ' + it.id + ' (' + why + '). The journal ' + ctx.journal.file + ' stays open; run any tv-suite command to retry, or restore by hand.');
    journal.mark(ctx.journal, { layer: null });
  }
  if (it.fallback === 'stub') {
    await installStub(ctx);
    const ok = await mounted(ctx);
    ctx.check('the stub is back', ok);
    if (!ok) throw new StopPass('STOP: the stub could not be mounted again after ' + it.id + '. The journal ' + ctx.journal.file + ' stays open.');
    journal.mark(ctx.journal, { stub: null });
  }
}

async function ask(ctx, it, rec, { answer, watchEvery }) {
  ctx.say('  press: ' + it.press + '\n  look:  ' + it.look + '\n  pass:  ' + it.pass);
  const t0 = Date.now();
  // Watch until the person answers.
  let answered = false, last = '';
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
}
