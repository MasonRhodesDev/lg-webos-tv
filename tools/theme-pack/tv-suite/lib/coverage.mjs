// Every item of TV-CHECKS.md, and how the suite covers it: automated (a deploy step, the cold boot or a scenario
// asserts it), partly (the suite asserts part, a person judges the rest), manual (a person at the TV, in the
// `manual` pass: `by: 'manual <item>'`, the suite watching), or not covered (the suite must not do it). `match` is a
// piece of the item's text; a test checks that every item has exactly one entry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CHECKS_FILE = path.join(here, '..', '..', 'TV-CHECKS.md');

const A = 'automated', PT = 'partly', MAN = 'manual', NO = 'not covered';
export const COVERAGE = [
  // Settings stub: boot mount
  { id: 'stub-mounted', match: 'after a cold boot says `settings stub mounted`, and `mount` lists', how: A, by: 'coldboot' },
  { id: 'stub-left-stock', match: 'With the layer missing (or failing to load)', how: PT, by: 'manual layer-broken', reason: 'the suite breaks the layer and checks the hook\'s verdict and the mount; a person opens the Home tile' },
  { id: 'stub-remove', match: '`install-boot.sh remove` unmounts', how: PT, by: 'manual stub-removed', reason: 'the suite removes the stub and checks the mount; a person opens the Home tile' },
  { id: 'sam-description', match: "SAM serves the stub's description", how: A, by: 'deploy boot (note), redirect' },
  { id: 'home-tile', match: "Home's Settings tile still shows a Settings icon", how: MAN, by: 'manual home-tile', reason: 'the Home screen is a person\'s (HOME is never pressed by the suite)' },
  { id: 'stub-resident', match: 'No stock Settings instance is resident after boot', how: A, by: 'coldboot' },
  // Launch shows nothing
  { id: 'home-tile-launch', match: 'Home screen Settings tile: our Settings opens at its top page', how: PT, by: 'redirect, manual home-tile', reason: 'SAM launches with a burst of captures are automated; the tile itself is pressed by a person while the suite watches' },
  { id: 'stub-leaves', match: 'The stub has left `applicationManager/running` within 1 s', how: A, by: 'redirect' },
  { id: 'picture-blink', match: 'The live picture underneath does not blink or reload', how: MAN, by: 'manual picture-blink', reason: 'captures hold the UI layer only (the video is black); a person watches' },
  { id: 'launch-while-open', match: 'A launch while our Settings is already open', how: A, by: 'redirect' },
  { id: 'service-killed', match: "With the Look service's process killed", how: NO, reason: 'the suite kills no process on the TV' },
  // Deep links
  { id: 'deep-links-all', match: 'For every key of `settings/catalog.json` `lgTargets.map`', how: A, by: 'redirect-all' },
  { id: 'unknown-target', match: 'An unknown target and no params both open the top', how: A, by: 'redirect' },
  { id: 'real-callers', match: 'The real callers, not just luna-send', how: MAN, by: 'manual real-callers', reason: 'those buttons live in LG apps; the suite logs the page each one opens' },
  { id: 'relaunch', match: 'two launches 100 ms apart', how: A, by: 'redirect' },
  // Back (stub)
  { id: 'deep-back', match: "After a deep link, Back goes through our Settings' own Back rule", how: A, by: 'redirect' },
  { id: 'back-refusing-app', match: 'Back over an app that refuses Back: our Settings closes and Home opens', how: MAN, by: 'manual back-refusing-app', reason: 'needs such an app in front; the suite logs the app and checks no stub is left' },
  { id: 'exit-home', match: 'Exit and Home close it from a deep-linked page', how: PT, by: 'manual exit, manual home', reason: 'the suite opens the deep link and checks Settings closed; a person presses EXIT and HOME' },
  // Settings core: host and boot order
  { id: 'host-ready', match: 'The reports have `ready` "settings: host ready" within a few seconds', how: A, by: 'deploy layer' },
  { id: 'hook-order', match: 'says `settings stub mounted` only after that report', how: A, by: 'coldboot', reason: 'the part-removed variant is manual part-removed' },
  // Bus identity
  { id: 'groups', match: '`permissions.sh` prints `compositor groups: ...`', how: A, by: 'deploy look (recorded), reads' },
  { id: 'host-reads', match: 'our Settings reads values (Picture mode shows the', how: A, by: 'picture-mode, write-name, write-toggle, write-picture-mode' },
  { id: 'ls-hubd-refuses', match: 'If ls-hubd refuses groups from the dev directory', how: PT, by: 'write-name, write-toggle, write-picture-mode, write-volume-row', reason: 'a refused write fails with the store\'s exact report; switching Store.qml\'s appId (option 2) is a code change' },
  { id: 'volume-calls', match: 'The volume (`com.webos.audio getVolume/setVolume`) and Screen off', how: PT, by: 'volume, mute, write-volume-row, manual screen-off', reason: 'Screen off blanks the panel: a person checks the sound goes on and a press wakes it' },
  // Hook A
  { id: 'hookA-report', match: 'The reports have `ok` "settings: the gear opens our quick sheet', how: A, by: 'quick-sheet' },
  { id: 'gear-opens', match: 'The gear opens our quick sheet, never LG\'s Quick Settings', how: PT, by: 'quick-sheet, manual gear-after-an-hour', reason: 'rerun after an hour on' },
  { id: 'gear-closes', match: 'The gear again closes it', how: PT, by: 'quick-sheet, manual gear-held', reason: 'a held gear cannot be injected; the suite counts the sheet\'s openings while a person holds it' },
  { id: 'hotkeys', match: 'The picture-mode hotkey opens the sheet', how: PT, by: 'quick-sheet, manual hotkeys', reason: 'the hotkeys are on the remote only; the suite logs the picker they open' },
  { id: 'no-lg-qs', match: 'No LG Quick Settings window is left behind', how: A, by: 'quick-sheet' },
  { id: 'qs-entry', match: 'QuickSettingsEntry.qml shares our engine', how: A, by: 'quick-sheet, manual part-removed', reason: 'LG\'s own Quick Settings in the fallback is tried by a person' },
  { id: 'part-removed', match: 'With our part removed from `Layer.qml` after Hook A applied', how: PT, by: 'manual part-removed', reason: 'the suite deploys the layer without our Settings part, checks the gear opens LG\'s, and restores; a person tries LG\'s' },
  { id: 'write-timeout', match: 'A write the TV never answers', how: NO, reason: 'the TV must leave a write unanswered, which means pulling our bus permissions under a running compositor: not done' },
  // Lists, forms and the PIN
  { id: 'wifi-shape', match: '`com.webos.service.wifi/findnetworks {subscribe}` answers', how: PT, by: 'reads, pages-view', reason: 'getstatus is read; the scan\'s rows are judged from the Wi-Fi capture' },
  { id: 'wifi-join', match: 'A join with a wrong password answers `errorCode` 10', how: NO, reason: 'the suite joins no network' },
  { id: 'wifi-scan', match: 'The Wi-Fi page starts `findnetworks` as soon as it opens', how: PT, by: 'pages-view', reason: 'the connection state is compared before and after; the scan\'s start and cancel are not observable from outside' },
  { id: 'wifi-groups', match: 'Our bus identity holds the wifi and btaudiosrc groups', how: A, by: 'reads (recorded groups)' },
  { id: 'bt-shape', match: '`com.webos.service.btaudiosrc`: `getPairedDevices`', how: PT, by: 'reads', reason: 'getPairedDevices is read; discovery and connect pair devices and are not run' },
  { id: 'pin-read', match: '`getSystemSettings {category: "lock", keys: ["systemPin"]}` is readable', how: PT, by: 'pin', reason: 'read as root; whether our identity can read it shows in the prompt\'s error text' },
  { id: 'pin-write', match: 'Writing `lock.systemPin` with `initialPinCode: false`', how: NO, reason: 'the suite changes no PIN' },
  { id: 'pin-no-limit', match: 'Owner decision: our PIN prompt has no limit', how: MAN, by: 'manual decisions', reason: 'an owner decision, not a check' },
  { id: 'input-locks', match: 'Input locks: `lock.inputBlock` is a bitmask', how: MAN, by: 'manual decisions', reason: 'research for a page not built' },
  { id: 'app-locks', match: 'App locks: the method that locks an app', how: MAN, by: 'manual decisions', reason: 'research for a page not built' },
  { id: 'device-name', match: '`network.deviceName` is a plain string', how: A, by: 'write-name' },
  // Focus and Back
  { id: 'focus-chain', match: 'Up/Down/OK reach our rows (LG\'s focus chain at layer 7)', how: PT, by: 'quick-sheet, settings-categories, manual channel-keys', reason: 'the channel keys are pressed by a person' },
  { id: 'back-rule', match: 'Back over live TV and over an HDMI input: one page back, then closed', how: PT, by: 'every menu scenario, manual back-live, manual back-hdmi', reason: 'a person switches the input; the suite repeats its Back scenarios on each' },
  { id: 'back-key', match: 'Whether Back arrives as `Qt.Key_Back` or `Key_Escape`', how: A, by: 'back-in-prompts', reason: 'which Qt key it is shows only in the compositor; BACK closing the prompts proves it is not Backspace' },
  { id: 'pointer', match: "The magic remote's pointer", how: MAN, by: 'manual pointer', reason: 'pointer moves are not injected; the suite logs the focus while a person moves it' },
  // Board content adapters
  { id: 'hdmi-info', match: 'luna://com.webos.service.tv.display/getHDMIInfo', how: PT, by: 'reads, manual hdmi-change', reason: 'the re-answer on a source change needs the source changed' },
  { id: 'system-info', match: 'luna://com.webos.service.tv.systemproperty/getSystemInfo', how: A, by: 'reads (values recorded)' },
  { id: 'network-time', match: 'luna://com.palm.systemservice/getPreferences', how: PT, by: 'reads', reason: 'setPreferences is a write' },
  { id: 'eula', match: '`getSystemSettings \'{"category":"","keys":["eulaStatus","localeInfo"]}\'`', how: A, by: 'reads' },
  { id: 'telemetry', match: 'luna://dev.themepack.look.service/getTelemetry', how: PT, by: 'reads, coldboot, manual telemetry-revert', reason: 'the revert is the owner\'s tool, run by hand' },
  { id: 'device-connector', match: "Device connector opens LG's connection wizard", how: MAN, by: 'manual leave-for-lg', reason: 'it leaves for LG\'s apps; the suite logs the app in front' },
  { id: 'groups-reads', match: '`permissions.sh` lists groups covering the new reads', how: A, by: 'reads (recorded groups)' }
];

// TV-CHECKS.md's items: a "- [ ]" line and its indented continuation lines, as one line.
export function items(text = fs.readFileSync(CHECKS_FILE, 'utf8')) {
  const out = [];
  let cur = null;
  for (const l of text.split('\n')) {
    if (/^- \[[ x]\] /.test(l)) { cur = l.replace(/^- \[[ x]\] /, ''); out.push(cur); }
    else if (cur !== null && /^ {6}\S/.test(l)) { cur += ' ' + l.trim(); out[out.length - 1] = cur; }
    else cur = null;
  }
  return out;
}

export function coverage(text) {
  return items(text).map((item) => {
    const hits = COVERAGE.filter((c) => item.includes(c.match));
    return { item, entries: hits };
  });
}
