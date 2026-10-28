// Every item of TV-CHECKS.md, and how the suite covers it: automated (a deploy step or scenario asserts it),
// partly (the suite asserts part, a person judges the rest from its captures or notes), manual (needs a person, a
// cold boot, another app or a key the suite never presses), or not covered (the suite must not do it). `match` is a
// piece of the item's text; a test checks that every item has exactly one entry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CHECKS_FILE = path.join(here, '..', '..', 'TV-CHECKS.md');

const A = 'automated', PT = 'partly', MAN = 'manual', NO = 'not covered';
export const COVERAGE = [
  // Settings stub: boot mount
  { id: 'stub-mounted', match: 'after a cold boot says `settings stub mounted`, and `mount` lists', how: PT, by: 'deploy boot',
    reason: 'deploy runs the hook and checks its log and `mount`; a cold boot is a person turning the TV off and on, then `deploy --check`' },
  { id: 'stub-left-stock', match: 'With the layer missing (or failing to load)', how: MAN,
    reason: 'needs the layer broken on purpose and a reboot; deploy does print the hook\'s exact "settings left stock (...)" reason when it happens' },
  { id: 'stub-remove', match: '`install-boot.sh remove` unmounts', how: MAN, reason: 'the boot step\'s rollback; the Home tile is opened by a person' },
  { id: 'sam-description', match: "SAM serves the stub's description", how: A, by: 'deploy boot (note), redirect' },
  { id: 'home-tile', match: "Home's Settings tile still shows a Settings icon", how: MAN, reason: 'the Home screen is never opened by the suite (HOME is never pressed)' },
  { id: 'stub-resident', match: 'No stock Settings instance is resident after boot', how: A, by: 'redirect (before any launch)', reason: 'after a cold boot, run `run --scenario redirect` first' },
  // Launch shows nothing
  { id: 'home-tile-launch', match: 'Home screen Settings tile: our Settings opens at its top page', how: PT, by: 'redirect',
    reason: 'the same SAM launch with no params is automated with a burst of captures to step through; the tile itself is pressed by a person' },
  { id: 'stub-leaves', match: 'The stub has left `applicationManager/running` within 1 s', how: A, by: 'redirect' },
  { id: 'picture-blink', match: 'The live picture underneath does not blink or reload', how: MAN, reason: 'captures hold the UI layer only (the video is black); a person watches' },
  { id: 'launch-while-open', match: 'A launch while our Settings is already open', how: A, by: 'redirect' },
  { id: 'service-killed', match: "With the Look service's process killed", how: NO, reason: 'the suite kills no process on the TV' },
  // Deep links
  { id: 'deep-links-all', match: 'For every key of `settings/catalog.json` `lgTargets.map`', how: A, by: 'redirect-all' },
  { id: 'unknown-target', match: 'An unknown target and no params both open the top', how: A, by: 'redirect' },
  { id: 'real-callers', match: 'The real callers, not just luna-send', how: MAN, reason: 'those buttons live in LG apps the suite does not drive; `redirect` sends the same targets through SAM' },
  { id: 'relaunch', match: 'two launches 100 ms apart', how: A, by: 'redirect' },
  // Back (stub)
  { id: 'deep-back', match: "After a deep link, Back goes through our Settings' own Back rule", how: A, by: 'redirect' },
  { id: 'back-refusing-app', match: 'Back over an app that refuses Back: our Settings closes and Home opens', how: MAN, reason: 'needs such an app in front, and lands on Home' },
  { id: 'exit-home', match: 'Exit and Home close it from a deep-linked page', how: MAN, reason: 'EXIT and HOME are never pressed by the suite' },
  // Settings core: host and boot order
  { id: 'host-ready', match: 'The reports have `ready` "settings: host ready" within a few seconds', how: A, by: 'deploy layer' },
  { id: 'hook-order', match: 'says `settings stub mounted` only after that report', how: PT, by: 'deploy boot',
    reason: 'the order is checked in one hook run; the cold boot and the broken-part variant are manual' },
  // Bus identity
  { id: 'groups', match: '`permissions.sh` prints `compositor groups: ...`', how: A, by: 'deploy look (recorded), reads' },
  { id: 'host-reads', match: 'our Settings reads values (Picture mode shows the', how: PT, by: 'picture-mode, quick-sheet',
    reason: 'reads: the picker lands on the TV\'s real mode; a write is never made by the suite' },
  { id: 'ls-hubd-refuses', match: 'If ls-hubd refuses groups from the dev directory', how: NO, reason: 'needs a write; the suite writes no setting' },
  { id: 'volume-calls', match: 'The volume (`com.webos.audio getVolume/setVolume`) and Screen off', how: PT, by: 'volume, mute',
    reason: 'getVolume and the keys are automated; Left/Right on the sheet\'s Volume row and Screen off change things and are manual' },
  // Hook A
  { id: 'hookA-report', match: 'The reports have `ok` "settings: the gear opens our quick sheet', how: A, by: 'quick-sheet' },
  { id: 'gear-opens', match: 'The gear opens our quick sheet, never LG\'s Quick Settings', how: PT, by: 'quick-sheet', reason: 'run the suite again after the TV has been on for an hour' },
  { id: 'gear-closes', match: 'The gear again closes it', how: PT, by: 'quick-sheet', reason: 'a held gear is not injectable (the socket sends presses)' },
  { id: 'hotkeys', match: 'The picture-mode hotkey opens the sheet', how: PT, by: 'quick-sheet', reason: 'showQuickSettings is automated; the hotkeys are on the remote only' },
  { id: 'no-lg-qs', match: 'No LG Quick Settings window is left behind', how: A, by: 'quick-sheet' },
  { id: 'qs-entry', match: 'QuickSettingsEntry.qml shares our engine', how: A, by: 'quick-sheet', reason: 'a fallback report fails the scenario; then check LG\'s Quick Settings by hand' },
  { id: 'part-removed', match: 'With our part removed from `Layer.qml` after Hook A applied', how: MAN, reason: 'needs a broken layer deployed' },
  { id: 'write-timeout', match: 'A write the TV never answers', how: NO, reason: 'needs a write' },
  // Lists, forms and the PIN
  { id: 'wifi-shape', match: '`com.webos.service.wifi/findnetworks {subscribe}` answers', how: PT, by: 'reads, pages-view', reason: 'getstatus is read; the scan\'s rows are judged from the Wi-Fi capture' },
  { id: 'wifi-join', match: 'A join with a wrong password answers `errorCode` 10', how: NO, reason: 'the suite joins no network' },
  { id: 'wifi-scan', match: 'The Wi-Fi page starts `findnetworks` as soon as it opens', how: PT, by: 'pages-view', reason: 'the connection state is compared before and after; the scan\'s start and cancel are not observable from outside' },
  { id: 'wifi-groups', match: 'Our bus identity holds the wifi and btaudiosrc groups', how: A, by: 'reads (recorded groups)' },
  { id: 'bt-shape', match: '`com.webos.service.btaudiosrc`: `getPairedDevices`', how: PT, by: 'reads', reason: 'getPairedDevices is read; discovery and connect pair devices and are not run' },
  { id: 'pin-read', match: '`getSystemSettings {category: "lock", keys: ["systemPin"]}` is readable', how: PT, by: 'pin', reason: 'read as root; whether our identity can read it shows in the prompt\'s error text' },
  { id: 'pin-write', match: 'Writing `lock.systemPin` with `initialPinCode: false`', how: NO, reason: 'the suite changes no PIN' },
  { id: 'pin-no-limit', match: 'Owner decision: our PIN prompt has no limit', how: MAN, reason: 'an owner decision, not a check' },
  { id: 'input-locks', match: 'Input locks: `lock.inputBlock` is a bitmask', how: MAN, reason: 'research for a page not built' },
  { id: 'app-locks', match: 'App locks: the method that locks an app', how: MAN, reason: 'research for a page not built' },
  { id: 'device-name', match: '`network.deviceName` is a plain string', how: NO, reason: 'needs a write (the keyboard scenario types nothing)' },
  // Focus and Back
  { id: 'focus-chain', match: 'Up/Down/OK reach our rows (LG\'s focus chain at layer 7)', how: PT, by: 'quick-sheet, settings-categories', reason: 'keys reaching our rows is automated; the channel keys afterwards are not pressed' },
  { id: 'back-rule', match: 'Back over live TV and over an HDMI input: one page back, then closed', how: PT, by: 'every menu scenario', reason: 'automated over whatever input is in front; run once on live TV and once on HDMI' },
  { id: 'back-key', match: 'Whether Back arrives as `Qt.Key_Back` or `Key_Escape`', how: A, by: 'back-in-prompts', reason: 'which Qt key it is shows only in the compositor; BACK closing the prompts proves it is not Backspace' },
  { id: 'pointer', match: "The magic remote's pointer", how: MAN, reason: 'pointer moves are not injected (the socket has no pointer events in this suite)' },
  // Board content adapters
  { id: 'hdmi-info', match: 'luna://com.webos.service.tv.display/getHDMIInfo', how: PT, by: 'reads', reason: 'asserted when an HDMI input is in front; the re-answer on a source change is manual' },
  { id: 'system-info', match: 'luna://com.webos.service.tv.systemproperty/getSystemInfo', how: A, by: 'reads (values recorded)' },
  { id: 'network-time', match: 'luna://com.palm.systemservice/getPreferences', how: PT, by: 'reads', reason: 'setPreferences is a write' },
  { id: 'eula', match: '`getSystemSettings \'{"category":"","keys":["eulaStatus","localeInfo"]}\'`', how: A, by: 'reads' },
  { id: 'telemetry', match: 'luna://dev.themepack.look.service/getTelemetry', how: PT, by: 'reads', reason: 'the cold boot and the revert are manual' },
  { id: 'device-connector', match: "Device connector opens LG's connection wizard", how: MAN, reason: 'it leaves for another app' },
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
