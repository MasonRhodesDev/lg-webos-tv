// The checks that need a person at the TV, as one ordered pass: watching the picture (captures hold our layer only,
// the video is black), switching inputs and channels (the owner's), and real devices. For each: what to press, what
// to look for, what counts as a pass. While the person presses, the suite watches our parts' probes, the system UI and
// the app in front, and logs what it saw; it runs what it can itself and asserts what it can see. The person gives
// the verdict: p (pass), f (fail) or s (skip), then an optional note. Everything else once here is a scenario now
// (scenarios.mjs).
import { closeAll, runScenarios, baseline, finish, probingUp } from './run.mjs';
import { SCENARIOS } from './scenarios.mjs';

const SAM = 'luna://com.webos.applicationManager';

const scenarios = (ids) => SCENARIOS.filter((s) => ids.includes(s.id));

// The Back scenarios on whatever input the person chose: the runner restores the foreground to that input meanwhile,
// not to the baseline's (the person puts the baseline's back afterwards, and the suite checks).
async function onInputInFront(ctx) {
  ctx.foregroundOverride = await ctx.foreground();
  try { return (await runScenarios(ctx, scenarios(['quick-sheet', 'picture-mode']))).runs.every((r) => r.status === 'pass'); }
  finally { ctx.foregroundOverride = null; }
}

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
  { group: '1. Our Settings over the picture', items: [
    { id: 'picture-blink', restores: 'input', covers: ['picture-blink'],
      press: 'On Live TV, open the Settings tile and close it with BACK. Then switch to an HDMI input yourself and do the same. Afterwards, put the TV back on the input it was on (the suite checks).',
      look: 'The picture underneath, while our Settings opens and closes.',
      pass: 'The picture never blinks, freezes or reloads, on Live TV and on HDMI.' },
    { id: 'real-callers', restores: 'input', covers: ['real-callers'],
      press: "Where your TV shows them, follow LG's own routes into Settings: Home's network hint, Bluetooth surround in Home's connections, the on-screen keyboard's voice-language link, the live menu's zip-code guide. Close Settings with BACK after each.",
      look: 'Which page our Settings opens on each time (the suite logs it).',
      pass: 'Network, Bluetooth, Language and Location pages, each from its route.' }
  ] },
  { group: '2. Remote buttons and the pointer', items: [
    // The network input sends each press whole: 20 presses 100 ms apart toggle the sheet (as separate presses should),
    // where a held button sends auto-repeats that LG's key filter drops. Only a real hold shows this.
    { id: 'gear-held', covers: ['gear-closes'],
      press: 'Hold the gear button for two seconds, then let go.',
      look: 'The quick sheet opens once and stays open. (The suite samples about twice a second, so a shorter flicker is yours to see.)', pass: 'No flicker open and shut.',
      check: (saw) => saw.filter((l) => /sheet quick/.test(l.what) && !/sheet quick/.test(l.was)).length === 1 },
    // The network input's pointer messages (type:move with dx, dy, drag; click; scroll) reach the layer only now and
    // then, after an LGE_CURSOR_SHOW key, and from where the cursor happens to be: rows cannot be aimed at.
    { id: 'pointer', covers: ['pointer'],
      press: 'Shake the magic remote to show the pointer. Open the gear sheet, move the pointer over its rows, click Picture mode, then press BACK twice.',
      look: 'Focus follows the pointer; the click opens the picker.', pass: 'Rows follow the pointer and a click opens the picker; no value changes.' },
    { id: 'screen-off', restores: 'screen', covers: ['volume-calls'],
      press: 'In the gear sheet, move to Screen off and press OK. Wait a few seconds, then press any button: you restore the screen (the suite checks it is on).',
      look: 'The panel goes dark while the sound plays on; a button wakes it.', pass: 'Dark with sound, back on at a press.' },
    { id: 'channel-keys', restores: 'channel', covers: ['focus-chain'],
      press: 'Over Live TV, open the gear sheet and close it with BACK, then press CH+ and CH-: CH- puts you back on the channel you were on. Afterwards, put the TV back on the input it was on.',
      look: 'The channel keys work straight after the sheet closes.', pass: 'The channel changes at the first press.' }
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
  { group: '4. Later, and decisions', items: [
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
  ] },
  { group: '5. The Home dock (the key filter can cost keys: a power cycle gives LG\'s chain back)', items: [
    { id: 'home-keys', restores: 'input', covers: ['home-filter-in', 'home-other-keys', 'home-open-close', 'home-switch', 'home-long', 'home-launch'],
      press: 'With the dock closed, press the arrows, OK, BACK and volume. Then a short HOME; BACK; HOME twice; HOME, then LEFT/RIGHT and OK on another input; finally hold HOME for two seconds. Afterwards put the input back.',
      look: 'Other keys as before; the dock along the bottom; it closes on BACK and on the second HOME; OK switches and closes; a long HOME opens LG\'s Home. The reports say the filter is in and count each request.',
      pass: 'Every step does what it says, and no key is lost.' },
    { id: 'home-pointer', covers: ['home-pointer'],
      press: 'Open the dock with HOME, shake the magic remote, point at tiles, click one, then open the dock again and click above it.',
      look: 'Focus follows the pointer; a click switches; a click outside closes.', pass: 'All three.' },
    { id: 'home-handover', covers: ['home-handover'],
      press: 'Open the gear sheet, press HOME, press the gear again, then BACK.',
      look: 'Only one of ours is open at a time.', pass: 'The sheet gives way to the dock and back; BACK closes.' },
    { id: 'home-reapply', covers: ['home-reapply'],
      press: 'Run own-layer-tv.sh apply a second time, then repeat home-keys.',
      look: 'The old layer reports LG\'s chain restored, the new one the filter in.', pass: 'home-keys passes again.' },
    { id: 'home-power', covers: ['home-power'], later: true,
      press: 'Power off with the remote, wait a minute (the Quick Start+ background boot), power on, press HOME.',
      look: 'What HOME opens.', pass: 'Our dock.' },
    { id: 'home-later', covers: ['home-usb', 'home-tiles', 'home-foreground'], later: true,
      press: 'Plug in a USB drive and open the dock; OK on USB. Open the dock, OK on Settings; again, OK on LG Home. Open the dock and launch an app from a phone.',
      look: 'The USB tile named after the drive and what it opens; our Settings; LG\'s Home; the dock closing.',
      pass: 'Each tile opens what it names; the dock closes when another app comes in front.' }
  ] }
];

export function printChecklist(say) {
  let n = 0;
  for (const g of CHECKLIST) {
    say('\n' + g.group);
    for (const it of g.items) {
      n++;
      say('  ' + n + '. [' + it.id + ']' + (it.auto ? ' (the suite runs this step)' : ''));
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
      try {
        try {
          if (!it.later) { const why = await closeAll(ctx); if (why) throw new Error(why); }
        } catch (e) { ctx.check('prepare ' + it.id, false, e.message); }
        await ask(ctx, it, rec, { answer, watchEvery });
        if (it.restores && !it.later) await personRestored(ctx, it, answer);
      } catch (e) {
        ctx.check('step ' + it.id, false, e.message);
      }
      if (rec.checks.some((c) => !c.ok) && rec.verdict === 'pass') rec.verdict = 'fail';
      ctx.say('  -> ' + rec.verdict + (rec.note ? ': ' + rec.note : ''));
    }
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
