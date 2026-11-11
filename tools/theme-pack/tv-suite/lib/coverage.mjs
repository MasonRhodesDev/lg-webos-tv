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
  { id: 'stub-left-stock', match: 'With the layer missing (or failing to load)', how: PT, by: 'fallback-layer-broken', reason: 'the layer deployed broken; the Look package removed is not run (deploy reinstalls it)' },
  { id: 'stub-remove', match: '`install-boot.sh remove` unmounts', how: A, by: 'fallback-stub-removed', reason: 'the Home tile\'s launch is made through SAM, as the tile makes it' },
  { id: 'sam-description', match: "SAM serves the stub's description", how: A, by: 'deploy boot (note), redirect' },
  { id: 'home-tile', match: "Home's Settings tile still shows a Settings icon", how: PT, by: 'home-tile', reason: 'Home is captured; a person judges the tile icons from the capture' },
  { id: 'stub-resident', match: 'No stock Settings instance is resident after boot', how: A, by: 'coldboot' },
  // Launch shows nothing
  { id: 'home-tile-launch', match: 'Home screen Settings tile: our Settings opens at its top page', how: A, by: 'redirect', reason: 'the tile is a SAM launch of com.palm.app.settings, which redirect makes with a burst of captures' },
  { id: 'stub-leaves', match: 'The stub has left `applicationManager/running` within 1 s', how: A, by: 'redirect' },
  { id: 'picture-blink', match: 'The live picture underneath does not blink or reload', how: MAN, by: 'manual picture-blink', reason: 'captures hold the UI layer only (the video is black); a person watches' },
  { id: 'launch-while-open', match: 'A launch while our Settings is already open', how: A, by: 'redirect' },
  { id: 'service-killed', match: "With the Look service's process killed", how: NO, reason: 'the suite kills no process on the TV' },
  // The Look app
  { id: 'look-app-launch', match: 'After installing the Look package, Home shows the Look icon', how: PT, by: 'look-app, home-tile',
    reason: 'the launch, the page and the app leaving are automated through SAM; the icon is judged from home-tile\'s capture, the picture is manual picture-blink' },
  { id: 'look-app-bus', match: "The app's bus calls reach the Look service as `dev.themepack.look`", how: A, by: 'look-app' },
  // Deep links
  { id: 'deep-links-all', match: 'For every key of `settings/catalog.json` `lgTargets.map`', how: A, by: 'redirect-all' },
  { id: 'unknown-target', match: 'An unknown target and no params both open the top', how: A, by: 'redirect' },
  { id: 'real-callers', match: 'The real callers, not just luna-send', how: MAN, by: 'manual real-callers', reason: 'those buttons live in LG apps; the suite logs the page each one opens' },
  { id: 'relaunch', match: 'two launches 100 ms apart', how: A, by: 'redirect' },
  // Back (stub)
  { id: 'deep-back', match: "After a deep link, Back goes through our Settings' own Back rule", how: A, by: 'redirect' },
  { id: 'back-refusing-app', match: 'Back over an app that refuses Back: our Settings closes and Home opens', how: PT, by: 'back-refusing-app', reason: 'no streaming app is installed: one of LG\'s apps stands in, and where Back lands is recorded' },
  { id: 'exit-home', match: 'Exit and Home close it from a deep-linked page', how: A, by: 'exit-home' },
  // Settings core: host and boot order
  { id: 'host-ready', match: 'The reports have `ready` "settings: host ready" within a few seconds', how: A, by: 'deploy layer' },
  { id: 'hook-order', match: 'says `settings stub mounted` only after that report', how: A, by: 'coldboot', reason: 'the part-removed variant is fallback-part-removed' },
  // Bus identity
  { id: 'groups', match: '`permissions.sh` prints `compositor groups: ...`', how: A, by: 'deploy look (recorded), reads' },
  { id: 'host-reads', match: 'our Settings reads values (Picture mode shows the', how: A, by: 'picture-mode, write-name, write-toggle, write-picture-mode' },
  { id: 'ls-hubd-refuses', match: 'If ls-hubd refuses groups from the dev directory', how: PT, by: 'write-name, write-toggle, write-picture-mode, write-volume-row', reason: 'a refused write fails with the store\'s exact report; switching Store.qml\'s appId (option 2) is a code change' },
  { id: 'volume-calls', match: 'The volume (`com.webos.audio getVolume/setVolume`) and Screen off', how: PT, by: 'volume, mute, write-volume-row, manual screen-off', reason: 'Screen off blanks the panel: a person checks the sound goes on and a press wakes it' },
  // Hook A
  { id: 'hookA-report', match: 'The reports have `ok` "settings: the gear opens our quick sheet', how: A, by: 'quick-sheet' },
  { id: 'gear-opens', match: 'The gear opens our quick sheet, never LG\'s Quick Settings', how: PT, by: 'quick-sheet, manual gear-after-an-hour', reason: 'rerun after an hour on' },
  { id: 'gear-closes', match: 'The gear again closes it', how: PT, by: 'quick-sheet, manual gear-held', reason: 'the network input sends whole presses, never a hold\'s auto-repeats; the suite counts the sheet\'s openings while a person holds it' },
  { id: 'hotkeys', match: 'The picture-mode hotkey opens the sheet', how: A, by: 'hotkeys, quick-sheet', reason: 'the hotkeys\' Quick Settings launch with its activateType is made through systemUIManager (the network input has no key for them)' },
  { id: 'no-lg-qs', match: 'No LG Quick Settings window is left behind', how: A, by: 'quick-sheet' },
  { id: 'qs-entry', match: 'QuickSettingsEntry.qml shares our engine', how: A, by: 'quick-sheet, fallback-part-removed', reason: 'LG\'s Quick Settings in the fallback is driven blind (its focus is not probed): captures show it, the baseline catches a change' },
  { id: 'part-removed', match: 'With our part removed from `Layer.qml` after Hook A applied', how: A, by: 'fallback-part-removed' },
  { id: 'write-timeout', match: 'A write the TV never answers', how: NO, reason: 'the TV must leave a write unanswered, which means pulling our bus permissions under a running compositor: not done' },
  // Lists, forms and the PIN
  { id: 'wifi-shape', match: '`com.webos.service.wifi/findnetworks {subscribe}` answers', how: PT, by: 'reads, pages-view', reason: 'getstatus is read; the scan\'s rows are judged from the Wi-Fi capture' },
  { id: 'wifi-join', match: 'A join with a wrong password answers `errorCode` 10', how: NO, reason: 'the suite joins no network' },
  { id: 'wifi-scan', match: 'The Wi-Fi page starts `findnetworks` as soon as it opens', how: PT, by: 'pages-view', reason: 'the connection state is compared before and after; the scan\'s start and cancel are not observable from outside' },
  { id: 'wifi-groups', match: 'Our bus identity holds the wifi and btaudiosrc groups', how: A, by: 'reads (recorded groups)' },
  { id: 'bt-shape', match: '`com.webos.service.btaudiosrc`: `getPairedDevices`', how: PT, by: 'reads', reason: 'btaudiosrc does not answer on this firmware; the suite reads bluetooth2 device/getStatus (devices with paired and connectedProfiles) instead; discovery and connect pair devices and are not run' },
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
  { id: 'pointer', match: "The magic remote's pointer", how: MAN, by: 'manual pointer', reason: 'the network input\'s pointer moves reach the layer only now and then and cannot be aimed; the suite logs the focus while a person moves it' },
  // Board content adapters
  { id: 'hdmi-info', match: 'luna://com.webos.service.tv.display/getHDMIInfo', how: PT, by: 'reads, manual hdmi-change', reason: 'the re-answer on a source change needs the source changed' },
  { id: 'system-info', match: 'luna://com.webos.service.tv.systemproperty/getSystemInfo', how: A, by: 'reads (values recorded)' },
  { id: 'network-time', match: 'luna://com.palm.systemservice/getPreferences', how: PT, by: 'reads', reason: 'setPreferences is a write' },
  { id: 'eula', match: '`getSystemSettings \'{"category":"","keys":["eulaStatus","localeInfo"]}\'`', how: A, by: 'reads' },
  { id: 'telemetry', match: 'luna://dev.themepack.look.service/getTelemetry', how: PT, by: 'reads, coldboot, manual telemetry-revert', reason: 'the revert is the owner\'s tool, run by hand' },
  { id: 'device-connector', match: "Device connector opens LG's connection wizard", how: A, by: 'leave-for-lg' },
  { id: 'groups-reads', match: '`permissions.sh` lists groups covering the new reads', how: A, by: 'reads (recorded groups)' },
  // Bluetooth: bluetooth2 for status, btaudiosrc for actions
  { id: 'bt2-status', match: 'The Bluetooth page lists the paired speakers from `luna://com.webos.service.bluetooth2/device/getStatus`', how: MAN, by: 'manual bluetooth', reason: 'turning a speaker on and off is a person\'s' },
  { id: 'bt-remote-hidden', match: 'The magic remote ("LGE MR19", BLE) is never listed', how: MAN, by: 'manual bluetooth', reason: 'the suite does not yet read the Bluetooth page\'s rows' },
  { id: 'bt-actions', match: 'These btaudiosrc calls, LG\'s own Settings\' methods, answer from our identity', how: MAN, by: 'manual bluetooth', reason: 'pairing and forgetting a real speaker change the household\'s devices' },
  // The Home dock
  { id: 'home-filter-in', match: 'The reports have `ok` "home: the Home key opens our dock', how: MAN, by: 'manual home-keys', reason: 'installing the key filter is gated on a person holding the remote' },
  { id: 'home-other-keys', match: 'Arrows, OK, Back and volume behave as before, with the dock closed', how: MAN, by: 'manual home-keys', reason: 'a lost key is a person\'s to notice' },
  { id: 'home-open-close', match: 'A short Home opens the dock along the bottom', how: MAN, by: 'manual home-keys', reason: 'the network input sends whole presses; the press length is a person\'s' },
  { id: 'home-switch', match: 'Left and right move focus; OK on an input switches', how: MAN, by: 'manual home-keys', reason: 'switching input changes what the household is watching' },
  { id: 'home-long', match: 'Holding Home about a second opens LG', how: MAN, by: 'manual home-keys', reason: 'only a real hold shows it' },
  { id: 'home-pointer', match: 'The magic remote: pointing at a tile focuses it', how: MAN, by: 'manual home-pointer', reason: 'the network input\'s pointer cannot be aimed' },
  { id: 'home-handover', match: 'Our quick sheet open, then Home', how: MAN, by: 'manual home-handover', reason: 'needs the gear and Home pressed in turn on the remote' },
  { id: 'home-reapply', match: 'A second `apply`: the reports have', how: MAN, by: 'manual home-reapply', reason: 'reinstalls the key filter, gated on a person holding the remote' },
  { id: 'home-power', match: 'Power off with the remote, wait for the Quick Start+ background boot', how: MAN, by: 'manual home-power', reason: 'a power cycle is a person\'s' },
  { id: 'home-launch', match: 'from SSH opens the dock too', how: MAN, by: 'manual home-keys', reason: 'checked with the key steps' },
  { id: 'home-no-dock', match: 'With our layer gone (no `homeReady`)', how: NO, reason: 'the suite deploys no layer without the dock' },
  { id: 'home-usb', match: 'The USB tile with a drive attached', how: MAN, by: 'manual home-later', reason: 'a drive is plugged in by a person' },
  { id: 'home-tiles', match: 'The Settings tile opens our Settings', how: MAN, by: 'manual home-later', reason: 'not yet in a scenario' },
  { id: 'home-foreground', match: 'A change of the app in front', how: MAN, by: 'manual home-later', reason: 'an app is launched from outside the TV' }
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
