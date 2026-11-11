# Our own Settings: research and plan

Goal: the remote's settings button opens **our** Settings, drawn by our compositor layer from the kit (`ui/Look/kit`;
the design is linked from `docs/design/README.md` at the repo root), and the household never meets LG's Settings app (`com.palm.app.settings`). No LG
file is edited.

This is research and a plan. Nothing here is built yet. Everything was read offline from the stock QML, the stock
Settings bundle and the TV's `/etc/palm` description files. The TV could not be reached while this was written, so
every claim marked **TV** still needs a read-only check there.

- `settings/catalog.json` and `settings/<category>.json`: every item LG's Settings offers, with its API, value domain,
  rules and household tier. `settings/refresh-domains.mjs` rederives the domains from another TV's description.
- `test/settings-catalog.test.js` checks the catalog.

LG file references below are paths under `/usr/lib/qt5/qml` (QML) or LG's Settings bundle (`main.js`, webpack module
numbers as an unminifier prints them). They are reference only; no LG code enters this repo.

## 1. What LG's Settings does, in short

- Seven categories (`main.js` module 488): Picture, Sound, Channels, Network, General, Safety, Accessibility. Each is a
  page stack (`path` in its store); the page components are mapped per category (modules 504, 657, 701, 712, 766, 838,
  853). The catalog follows that tree: about 75 pages and 340 rows, many of them region or model gated.
- **Reading.** One `luna://com.webos.settingsservice/batch` call per page with `getSystemSettings` and
  `getSystemSettingDesc` operations, then `getSystemSettings {category, keys, subscribe: true}`. Writes are
  `setSystemSettings {category, settings, dimension?}`, resets `resetSystemSettings {category, keys, dimension?}`.
- **Visibility is mostly data.** A row is hidden when the key's description has `ui.visible: false` and greyed when
  `ui.active: false`; each enum value has its own `visible`/`active`. LG's code adds a few rules on top (ISF-only
  position controls, the white-balance method/point matrix); the catalog records those as `visibleWhen`.
- **Dimensions.** Picture values are stored per `input` × `pictureMode` × `_3dStatus`, and `pictureMode` itself per
  `dynamicRange` (`/etc/palm/description.map.json`). Reading without a dimension gives the current input's values;
  subscriptions fire when the input or HDR state changes, and so do the desc's `active` flags.
- Things outside settingsservice: sleep timer (`com.webos.service.tv.time` `getSleepTimeInfo`/`setSleepTimeInfo
  {sleepTimeMinute}`), network (`com.webos.service.connectionmanager getstatus`, `com.webos.service.wifi
  findnetworks|connect|setstate|deleteprofile`), Bluetooth audio (`com.webos.service.btaudiosrc`), time
  (`com.palm.systemservice getPreferences|setPreferences {useNetworkTime, timeZone}`, `/getPreferenceValues`,
  `/time/getSystemTime`, `/time/setSystemTime {utc}`; see "The clock" below), updates
  (`com.webos.service.update`), factory reset (`com.webos.service.tv.systemproperty/doUserDefault`), PIN
  (`com.webos.notification/createPincodePrompt`).
- **Launch params** (`main.js` module 31, the root component's `setPath`): `{target}` picks a page path from a table
  of 57 names (in `catalog.json` `lgTargets`; unknown names fall back to Picture), `{item}` focuses a row,
  `{pictureData, soundData}` pre-seeds values (sent by Quick Settings' All Settings row). A relaunch while open arrives
  as `webOSRelaunch` with the same params.

### Bus identity: what our layer may call

- Our layer's `Service` objects use `appId: "com.webos.surfacemanager.wedge"` (`Look.busName`), which belongs to no
  permission group until `service/permissions.sh` grants it one. It was `...systemui` at first (commit `6d1b402`), but
  the compositor's `...systemui` connection dates from the boot snapshot and a client gets its groups when it
  connects, so a grant made later never reached it. `...wedge` is allowed by the compositor's role file, unused by
  LG's QML, and first connects when the layer loads.
- LG's own Quick Settings runs **in the same compositor process** and calls, as `appId: "com.webos.app.quicksettings"`
  (`QuickSettings/Globals.js`, `QuickSettings/Service/QuickSettingsService.qml`): settingsservice get, set, desc and
  values for picture/sound/aspect (`ServiceModel/SettingsServiceModel.qml`, `PictureSettingModel.qml`,
  `SoundModeModel.qml`, `SoundOutServiceModel.qml`), `tv.time` sleep (`TimerServiceModel.qml`), `btaudiosrc`, `pdm`,
  `wisa`, `config`, `tv.display setPSMChangedByUser`, `applicationManager launch`, `notification createToast`. Many
  `Service` objects share that one appId in LG's code, so sharing an appId in one process is LG's own pattern.
- `/etc/palm/settingsservice.allow` lists 21 keys with read or read/write rights (captions on, sound output, digital
  audio, AV sync, eARC, TruMotion, SIMPLINK; country, audio guidance, high contrast, store mode read only). There is
  no `pictureMode` or `soundMode` in it. Hypothesis (**TV**): it is the allowlist for callers without the
  settingsservice groups. If so, `...wedge` today can write only those 21 keys.

Two ways to get the rights, in order of preference:

1. **Grant, through the existing boundary.** `service/permissions.sh` already writes a client-permissions file for
   `com.webos.surfacemanager.wedge` under `/var/luna-service2-dev`. Extend it with the groups the services below
   require for the methods we call, read from their api-permissions files (**TV**). This is explicit, revertible and
   names exactly what we use. Risk (**TV**): ls-hubd may refuse to grant system groups from the dev directory
   (groups carry trust levels); if it does, option 2 is the fallback.
2. **Use Quick Settings' identity.** Our Settings' data `Service` objects declare `appId: "com.webos.app.quicksettings"`.
   That identity demonstrably holds the tier-1 rights (picture/sound mode, sound out, sleep timer, aspect). It does
   not cover the rest (network config, time, update, reset, locks), so option 1 is needed for those anyway. It is
   also borrowing LG's name for our calls, which is why it is second.

To read on the TV before building the data layer (all read-only):

```sh
cat /usr/share/luna-service2/api-permissions.d/com.webos.settingsservice.api.json
cat /usr/share/luna-service2/client-permissions.d/com.webos.settingsservice.perm.json
cat /usr/share/luna-service2/manifests.d/starfish-luna-surface-manager.manifest.json   # names the compositor's files
grep -l quicksettings /usr/share/luna-service2/client-permissions.d/*                 # the groups QS holds
# and the same api-permissions files for tv.time, connectionmanager, wifi, btaudiosrc, palm.systemservice, update
luna-send -n 1 luna://com.webos.settingsservice/getSystemSettingDesc '{"category":"picture","keys":["pictureMode"]}'
cat /etc/configd/layers/base/com.webos.surfacemanager.json   # systemUIManager and keyFilters values
```

Services the shell calls, with the method set (the catalog has every item's): `com.webos.settingsservice`
(getSystemSettings, getSystemSettingDesc, getSystemSettingValues, setSystemSettings, resetSystemSettings, batch),
`com.webos.service.tv.time` (get/setSleepTimeInfo), `com.webos.service.tv.display` (setPSMChangedByUser),
`com.webos.service.connectionmanager` (getstatus, setipv4, setdns), `com.webos.service.wifi` (getstatus, setstate,
findnetworks, connect, deleteprofile, cancel), `com.webos.service.btaudiosrc` (getPairedDevices, getConnectedDevice,
getDeviceStatus, startDiscovery, cancelDiscovery, connect, disconnect, removePairedDevice), `com.palm.systemservice`
(getPreferences, setPreferences, getPreferenceValues, time/getSystemTime, time/setSystemTime, osInfo/query,
deviceInfo/query),
`com.webos.service.update` (getVersion, checkUpdate, getCurStatus), `com.webos.notification` (createPincodePrompt,
createToast), `com.webos.service.tts` (speak, when audio guidance is on).

## 2. Entry points, and how each reaches our Settings

Our Settings runs as a **system UI** in LG's overlay container, the way Quick Settings does (section 3.4). Two runtime
hooks reach it without editing anything; one class of entry point cannot be caught in the compositor at all.

### Hook A: the system UI table (catches the gear button and everything that opens Quick Settings)

`YSM/SystemUI/SystemUIManager.qml` (objectName `systemUIManager`, a direct child of the YSM root, `id: sysuiManager`
in `YSM.qml:2287`) holds `property var config` with `appinfo: [{id, defaultWindowType, main}]`. It is bound to
`systemSettings.systemUIManager`, which is configd's `com.webos.surfacemanager.systemUIManager`
(`YSM/SystemSettings.qml:1472`). On a fresh launch, `lifeCycle.launch.process` → `appinfo.assign(ev)` reads
`ev.main = payload.main || getByAppId(appId).main` and `sysuiModel.create(ev)` loads that URL in a
`StarfishSystemUIContainer`. The overlay view accepts any `_WEBOS_SYSTEM_UI_TYPE_OVERLAY` entry
(`YSM.qml:2357`, `overlayModel.register('systemui', ...)`; Quick Settings is refused only when `access.settings` is
false).

Our layer (it already gets `host`, the YSM root) finds `systemUIManager` among `host.children` and sets `config` to a
copy of LG's with:

- a new entry `{"id": "dev.themepack.settings", "defaultWindowType": "overlay", "main": "<our ui>/Settings/SettingsWindow.qml"}`,
- the `com.webos.app.quicksettings` entry's `main` pointed at our window too.

Assigning `config` breaks LG's binding, so the layer re-applies its copy on `host.systemSettings.systemUIManagerChanged`
(configd answers once at boot; **TV**: confirm it does not push again). Everything that opens Quick Settings then
opens ours, because it all funnels into `sysuiManager.launch`:

| Entry | Path today | With hook A |
|---|---|---|
| Gear button, short press | `KeyFilters/appLaunch.js` `handleHotkeys` case `Key_webOS_Settings` → `openSettings()` → `systemUIManager/launch {appId: quicksettings}` | our window, quick sheet |
| Gear while it is open | a second launch without params; LG's QS closes itself (`QuickSettings.qml` `onLaunch`) | ours must do the same: toggle |
| Picture-mode, aspect, sleep hotkeys | `appLaunch.js` `handleHotkeys` → `openSettings({activateType: "picture-mode" / "aspect-ratio" / "sleep"})` | our window opens that picker |
| `luna://com.webos.surfacemanager/showQuickSettings` | `YSM.qml:935` `showQuickSettings` → `sysuiManager.launch` | ours |
| Local (front panel) key | QS params `{localkey: true}` | ours, or keep LG's guide (rare) |
| Voice "open quick settings" | `SystemUIViewStateTransitionManager.onLaunchRequested` → `sysuiManager.launch` (`YSM.qml:2624`) | ours |
| Boot preload | `appLaunch.js` `init()` sends `{appId: quicksettings, reason: "preload"}` | our window must `exit()` at once, as `QuickSettings.qml` does |

Gear **long press**: this firmware has no long-press branch for `Key_webOS_Settings` (`appLaunch.js` has long-press
timers only for other keys; `handleHotkeys` ignores `autoRepeat` and the release returns NotAccepted while the overlay
has focus). Holding the gear re-sends the press, which toggles. Our window should ignore a repeat that arrives within
the open animation, and may treat a hold (repeats for 1 s) as "open All Settings" as a feature of ours. Whether the
B9's remote sends a different key on hold is unverified (**TV**: `luna-send` key log or `evtest` read).

Also in Quick Settings today, and therefore ours once hook A is in: the "All Settings" row, each row's long-OK deep
link (`View/QuickSettingsDotPicker.qml` `launchFullSettingApp` with `deepLinkParameter` `PictureMode`, `AspectRatio`,
`SoundModeSettings`, `SoundOut`, `Timer`), the network row (`target: "network"`) and the device row (`Bluetooth` /
`WiSASoundSync`). In our window these are internal page pushes, not SAM launches.

If the owner wants to keep LG's Quick Settings (skinned by our part) and replace only the full app, hook A still
works: leave the QS entry alone and add only ours. The QS rows then still launch LG's app through `launchService`
(`QuickSettings.qml:540`, a `QuickSettingsService` whose `service`/`method` are plain properties). Our QS part could
find that object in the container's `resources` and point it at `com.webos.service.systemUIManager` `/launch` with
`{appId: "dev.themepack.settings", params}`; but the payload shape differs (`{id, params}` against `{appId, params}`),
so that only works with a translating relay in our Look service. Unverified and fragile; replacing QS is the clean
path.

### Hook B: our own key policy (catches keys that go straight to SAM)

Two keys launch LG's Settings app directly from the key policy, skipping Quick Settings:

- `Qt.Key_Option` (`appLaunch.js` `handleHotkeys`): toggles `com.palm.app.settings` via `applicationManager.checkLaunch`.
- The accessibility hot key / long mute (`appLaunch.js` `launchAccessibility`): `{target: "accessibility"}`.
- `KeyFilters/easytv.js` launches `{target: "TimerPowerOn"}` (EasyTV models; not loaded here, **TV**).

`StarfishKeyFilter.qml` loads its policy files from `keyFilters` (configd `com.webos.surfacemanager.keyFilters`) and
reloads them all on `onKeyFiltersChanged` (`loadKeyFilters`, a C++ method of `KeyFilter`). Our layer can set
`host.keyFilter.keyFilters` to LG's list with our own small policy file first; it handles `Key_Option` and the
accessibility key by launching `dev.themepack.settings` with the matching target, and returns `NextPolicy` for
everything else. Caveats:

- The element format of `keyFilters` is in configd (**TV**); the policy file contract is the documented one at the
  top of `appLaunch.js` (`function(key, pressed, autoRepeat)` returning `KeyPolicy.*`, with the `properties` object's
  members as globals, `init()` called on load).
- A reload cancels LG's long-press timers and luna subscriptions and re-runs every `init()`, which re-sends the QS
  preload. Do it once, early (in `Layer` creation), not on every change.
- Overriding `keyFilter` itself from our derived root (it is a `property var` on YSM, bound into
  `compositor.keyFilter` at `YSM.qml:244`) would replace LG's whole object and its handlers; don't.

If hook B turns out not to work on the TV, these two keys keep opening LG's app; they are rarely pressed.

### What cannot be caught in the compositor

A SAM launch of `com.palm.app.settings` goes from the caller to SAM to WAM. The compositor only hears about it
through `applicationManager getAppLifeEvents` (`YSM.qml:642`, `onAppLifeEventsChanged`: `splash`, `stop`, ...) after
WAM is already starting the app, and never sees the params. Callers that do this (none of them run in the compositor):

| Caller | Target |
|---|---|
| Home launcher's Settings tile (`com.webos.app.home`, `com.webos.app.fullhome` launch points) | none (top page) |
| Home: network hint, AI data, Home settings (`fullhome/.../AppInterfaces.qml` `goToNetworkSettings`, `goToSettingsDeleteAIData`, `goToHomeSettings`) | `network`, `AiService`, `HomeSettings` |
| Home connections: Bluetooth surround (`ConnectionsInterfaces.qml` `launchBluetoothSurround`) | `Bluetooth` |
| Live menu exception guides (`com.webos.app.livemenu` `ExceptionsGuide.qml`): no zip code, channel tuning | `Location`, others |
| On-screen keyboard voice language (`maliit/plugins/qml/view-stt/main.qml` `launchSettings`) | `Language` |
| Network prompts and the network row in LG's QS (`QuickSettings/Service/NetworkService.qml` `launchNetwork`) | `network` |
| Other LG apps (tvhotkey, customer support, channel apps) | various |

No in-process hook exists for these. Hiding or killing LG's surface when it appears would flash LG's app and lose the
target, so we don't. The answer is the **launch stub** (built: `webos/settings-stub/`, README "The Settings stub"):
an app of our own with the id `com.palm.app.settings` (transparent overlay window, `noSplashOnLaunch`, an empty page)
that reads `PalmSystem.launchParams`, maps LG's `target` through `lgTargets` to our page id, calls the Look service's
`openSettings {target}` (our layer hears it as `Look.settingsRequested(target)`), and closes. The boot hook
bind-mounts it over the stock app directory, the mechanism the retired patched Settings used, and it contains no LG
code. It catches every SAM launch with its target. Without it, the launcher tile and the deep links above would keep
opening LG's Settings.

## 3. The shell

### 3.1 Information architecture

Household first: the things people change every week are one press away, the rest is one level down, nothing is
removed. Eight categories instead of LG's seven, with names a family member would guess.

| Our category | Tier-1 rows up front | Then | LG pages it absorbs |
|---|---|---|---|
| **Picture** | Picture mode; Brightness (backlight) | Contrast, colour, sharpness; Motion smoothing; Aspect ratio; Energy saving; Eye comfort; **Expert** (sub-page: advanced, expert, white balance, colour management, options, panel care) | Picture/* |
| **Sound** | Sound mode; Sound output; Bluetooth devices | Auto volume; Lip sync; Balance and equaliser; Surround; **More** (digital format, eARC, HDMI audio format, mounting, WiSA) | Sound/* |
| **Inputs & devices** | Switch input (opens the input picker); HDMI device control (SIMPLINK) | Deep colour per port; Instant game response per port; Wireless keyboard; Screen share | Network/Simplink, Picture/AdditionalOptions, General/WirelessKeyboard |
| **Network** | Status (online, how); Wi-Fi networks | Cable; TV name; Turn on by phone; IP and DNS | Network/* |
| **Timers & power** | Sleep timer | Auto power off; No-signal off; Power on/off timers; Quick Start+ | General/Timers, General/EcoMode |
| **Captions & access** | Captions on/off | Caption look; Audio description; Spoken menus; High contrast; Pointer | Accessibility/* |
| **Look** | Style; Themes | (our own: the styles and themes the Look service lists) | (ours) |
| **TV** | Time; Language | Location; Parental locks (PIN); Channels (scan, edit, copy); About and updates; Home screen options; Advertising and AI; Reset | General/*, Safety/*, Channels/* |

- The **quick sheet** (what the gear opens) is a short side panel of tier-1 rows: Picture mode, Sound mode, Sound
  output, Sleep timer, Captions, Network status, Look, and **All settings**. Picture/sound/sleep are steppers in place
  (Left/Right change them, as LG's QS does), the rest open pages. The hotkey params land on the matching row with its
  picker open.
- Region- and model-gated LG pages (Japan, Korea, Philippines, DVB, 8K, SIGNATURE, 3G/4G) are left out unless the
  description says the TV has them (`ui.visible`). Rows LG greys (`ui.active: false`) are shown disabled with a hint
  saying why when we know (e.g. "only with TV speakers").
- Search, help text panels and LG's "Settings Help" mode are not rebuilt.

### 3.2 Page types and the kit pieces they use

| Page type | Used for | Kit pieces |
|---|---|---|
| Category list | our Settings' first page | Screen, Panel, Header, RowList of `nav` ListRows (icon + hue per category), KeyHints |
| Sub-page | every settings page | Panel, Header (breadcrumb + title), RowList mixing `toggle`, `stepper`, `value`, `slider`, `nav`, `info` rows and Section headers, KeyHints |
| Value picker | any enum with more than ~4 values | RowList of `radio` rows; OK chooses and pops back |
| Live adjust | picture sliders | a `slider` row; while it has focus the panel shrinks to that one row at the bottom (Panel + ListRow alone), so the picture being tuned stays visible; Back or OK restores the page |
| Confirmation | resets, factory reset, Wi-Fi off, country, store mode | Scrim + Dialog with ButtonRow (default focus on the safe button) |
| Info page | About, TV information, network details | RowList of `info` rows (not focusable; the page scrolls by page) |
| Network list | Wi-Fi | RowList of rows with signal Icon, lock and connected Badge; a Section "Saved" and "Nearby"; rescans on open |
| Device list | Bluetooth, wireless keyboard, WiSA | RowList of device rows with Badge (connected/paired), a "Search" row while discovering |
| Form | Wi-Fi password, IP/DNS, manual time | TextPrompt: our own TextField and Keyboard (the Keyboard board). Not Maliit: it is a separate process that only client apps' text inputs summon |
| Busy / progress | scanning, connecting, updating | **gap in the kit**: an inline busy indicator on a row; long jobs show a progress row |
| PIN | Safety pages, locks | our PinPrompt (the PIN prompt board), checked against `lock.systemPin` as LG's Settings does |
| Feedback | "Saved", errors | LG toast via `createToast`, drawn by our toast part |

### 3.3 The data layer

One object, `ui/Settings/SettingsStore.qml` (a `QtObject`, ES5 only, Qt 5.6 imports), owns all reads, subscriptions
and writes. Pages bind to it and never call the bus.

- **Catalog in.** A build step (next to `export-json.mjs`) turns `settings/*.json` into `ui/Settings/catalog.js`
  (`.pragma library`, `var catalog = {...}`), so QML gets it without file I/O. Our IA (3.1) is a second small table,
  `ui/Settings/menu.js`, that lists our categories and pages by catalog item id.
- **Reads.** `watch(pageId)` collects the page's settingsservice items by category, sends one `batch` with
  `getSystemSettings` and `getSystemSettingDesc` per category, then opens one `getSystemSettings {category, keys,
  subscribe: true}` and one `getSystemSettingDesc {category, keys, subscribe: true}` per category. `unwatch(pageId)`
  cancels them when the page is popped (reference-counted per category, so the quick sheet and a page share).
- **One `Service` per open call.** `WebOSServices.Service.response(method, payload)` carries no call token, so the
  store keeps a small pool of `Service` objects, one per subscription and one per in-flight write, created with
  `Qt.createQmlObject`/a Component and destroyed after. This is LG's pattern too.
- **State.** `values[key]`, `desc[key]` (`{visible, active, values}` with per-value flags) and an integer `revision`
  bumped on every change; rows bind to `store.revision` plus their key, which is cheap in Qt 5.6 and avoids per-key
  signals. Dimensioned keys hold the current input's value; a change of `input`/`dynamicRange` (they are settings
  too, category `dimensionInfo`) triggers a re-read.
- **Writes.** `set(itemId, value)`: optimistic (the row shows the new value at once), sent as `setSystemSettings
  {category, settings: {key: value}}` (plus `current_app: true` for `arcPerApp`/`truMotionMode` as LG does), rolled
  back with a toast on failure. Sliders write at most every 100 ms and always send the last value. `pictureMode`
  also sends `tv.display setPSMChangedByUser`.
- **Other services.** Small adapters with the same `values`/`set` shape: `sleep` (`tv.time`, which does not answer
  `subscribed: true`, so it re-reads after each write), `network` (`connectionmanager getstatus` subscribe), `wifi`,
  `bluetooth`, `time`, `about`. Each is a `QtObject` the store owns.
- **The clock.** Time and date shows the TV's own time and sets it a part at a time (Year, Month, Day, Hour, Minute:
  stepper rows, Left/Right or OK, wrapping). The TV keeps no clock while unplugged: with no network time and no
  broadcast it starts every boot at the first second of 2019 (UTC), so setting it by hand is a routine job, not a
  rare one. The store reads `time/getSystemTime` (subscribed: `utc` in seconds, `offset` in minutes ahead of UTC)
  and holds the TV's time as a difference from the process clock, so nothing here depends on the zone or the time of
  whatever runs the QML. Steps add up locally and one `time/setSystemTime {utc}` goes out a moment after the last
  one; the time shown stands still while that write is in flight, a refusal puts the old time back with a toast,
  and if the zone's offset on the new date differs (a month stepped across a daylight-saving change) one more write
  keeps the hour that was shown. `ui/Look/settings/clock.js` does the calendar arithmetic from `utc` and `offset`
  alone. Time zone lists `getPreferenceValues {key: "timeZone"}`'s zones for the current zone's country and writes
  the whole zone object back. The 12- or 24-hour form follows `timeFormat`. Write timeouts are counted in ticks,
  not read off the clock, since a write here moves the clock. The Look service checks the day once a minute for the
  same reason: a date set by hand moves its seasonal calendar within the minute.
- **Never hardcode enums.** The catalog's `domain` is the offline seed and what the mocks use; on the TV the desc's
  `values.arrayExt` (with its `visible`/`active` per value) decides what a picker lists.
- **Identity.** The store's `Service` objects take their `appId` from one property, so the choice in section 1 is one
  line.
- **Harness.** The store talks only through `WebOSServices.Service`, which the harness mocks (section 4); nothing else
  needs a fake.

### 3.4 Hosting, focus and Back

- `ui/Settings/SettingsWindow.qml` is the `main` of our system UI entry. Its root is LG's
  `StarfishSystemUIWindow` imported by file URL (as `ui/YSM/Root.qml` imports YSM), which gives
  `lifeCycleStatus.launch/close`, `show()`, `hide()`, `exit()` and `webOSShell.setWindowProperty`.
- Lifecycle like `QuickSettings.qml` `onLaunch`: `reason: "preload"` → `exit()`; first launch → `show()` and open
  at `params.target` (LG target names, through `lgTargets`) or the quick sheet when there are no params; a launch
  while open with no params → close (gear toggles); `onClose` → close animation then `exit()`
  (`powerSuspend` → `exit()` at once).
- **Focus.** The overlay view gives the container focus through LG's `FocusHandler` (overlay layer 5); our window is
  a FocusScope, and the page stack inside gives `focus` to the current page's RowList. The kit's lists handle
  Up/Down/OK/Left/Right (`kit/keys.js`). No `FocusHandler` import of our own is needed, which avoids the unverified
  layer-7 scheme.
- **Back.** The container's `AccessControlPolicy` starts with `keyFilter.back = true` ("filter out";
  `AccessControlPolicy.qml` `Component.onCompleted` → `reset()`), and `KeyFilters/systemUi.js` case `Key_webOS_Back`
  then closes the whole overlay (`overlayView.close()`). That is why Back closes LG's Quick Settings in one step.
  Our window calls `webOSShell.setWindowProperty("_WEBOS_ACCESS_POLICY_KEYS_BACK", "true")` at launch, which
  `policy_keyfilter` turns into `keyFilter.back = false` (`StarfishViewContainer.qml` `updateProperties`). The policy
  then falls through to `activeSurfaceAcceptsBackKey()`, which asks the **fullscreen app underneath** (a system UI is
  not a surface):
  - if that app accepts Back, the key is NotAccepted and reaches our focused RowList, which emits `back`: pop one
    page; on the first page, close;
  - if it does not, the policy emits `backReleased` and `YSM.qml` `onBackReleased` launches Home; our window cannot
    veto that, so it also closes on `host.keyFilter.backReleased` rather than lingering over Home.
  Which foreground apps on this TV refuse Back (live TV, the HDMI input apps) decides how often the second case
  happens (**TV**). If it is common, the fallback is to leave the property unset: Back then always closes our whole
  overlay (never Home), at the cost of page-by-page Back. Exit and Home close it either way.
- Inputs keep working underneath: an overlay system UI does not take the screen; the live picture shows through the
  Scrim, which matters when tuning picture.
- Audio guidance: when `option.audioGuidance` is on, focused rows speak their label and value through
  `com.webos.service.tts/speak`, as LG's QS does (`Service/TTSService.qml`).

### 3.5 What we deliberately do not rebuild

- Account sign-in, LG Content Store, membership, service country and terms (EULA) pages: they need LG's online
  services, which this offline TV does not use.
- Software update download/install: show the version only; on a rooted TV an update can remove root. Keep
  `support.automaticUpdate` visible but default off.
- AI recommendations, "Who.Where.What?", advertising, Live Plus, Home promotions: kept as plain switches under TV >
  Privacy, not as pages.
- Channel tuning and channel editing: LG runs them as separate apps (`com.webos.app.channelsetting`,
  `com.webos.app.channeledit`); our rows launch them as they are.
- Picture test / sound test diagnostics, the RGBW dot pattern, ISF calibration and the 22-point white balance: kept
  reachable under Picture > Expert, drawn as plain rows, no special screens.
- Region-only pages (B-CAS, Korean/Philippine/Chinese address entry, HbbTV, MHEG, teletext, 3G/4G, Twin TV,
  SIGNATURE always-on): not built until a TV that has them is in hand. The catalog keeps them for completeness.
- Hotel/commercial mode keys (category `hotelMode`): never shown.

## 4. Harness mocks

The preview mock `preview/mocks/WebOSServices/Service.qml` answers the Look service from `Fixture`. The settings
fixtures go where `preview/render.mjs` scenes can load them (main has it now). For Settings the mock answers these from a settings fixture (a JSON file per scene, defaulting to one built from the catalog's domains):

| Call | Mock answer |
|---|---|
| `com.webos.settingsservice/getSystemSettings {category, keys, subscribe?}` | `{returnValue, category, settings: {key: value}}` from the fixture; subscriptions answered again whenever a set changes one of their keys |
| `.../getSystemSettingDesc {category, keys}` | `{returnValue, results: [{key, ui: {visible, active}, values: {arrayExt: [{value, visible, active}]} or {range}}]}` from the catalog's domain, with per-scene overrides (a hidden or greyed row, one disabled value) |
| `.../getSystemSettingValues {category, key}` | `{returnValue, values: [...]}` for dynamic keys (menu languages, white-balance code values) |
| `.../setSystemSettings`, `.../resetSystemSettings` | update the fixture, `{returnValue: true}`; a scene can force `{returnValue: false, errorText}` to show the rollback |
| `.../batch {operations}` | each operation answered as above, in `results` |
| `com.webos.service.tv.time/getSleepTimeInfo`, `setSleepTimeInfo` | `{sleepTimeMinute, sleepTimeSecond}` |
| `com.webos.service.connectionmanager/getstatus` | the boards' TV by default: on a cable with the internet blocked, addresses from the documentation ranges (RFC 5737); scenes switch to online or Wi-Fi variants |
| `com.webos.service.wifi/findnetworks` | five networks with signal levels 1-4, open and secured, one connected, one saved |
| `com.webos.service.btaudiosrc/getPairedDevices`, `getConnectedDevice` | two paired devices, one connected |
| `com.palm.systemservice/getPreferences {keys}` | the keys asked for: `useNetworkTime`, `timeFormat` (`HH12`), `timeZone` (a whole zone object: `ZoneID`, `City`, `Description`, `CountryCode`, `offsetFromUTC`, `supportsDST`); a change posts only its key, with no `returnValue` |
| `com.palm.systemservice/getPreferenceValues {key: "timeZone"}` | eleven zones in four countries |
| `com.palm.systemservice/time/getSystemTime`, `setSystemTime {utc}` | a clock that stands still at a fixed evening (`utc` seconds, `offset` minutes, an hour more in summer where the zone has it); a set posts to the subscription, and a scene can refuse it or leave it unanswered |
| `com.webos.service.update/getVersion`, `com.palm.systemservice/osInfo/query` | a fixed version string |

Fixture scenes to render: quick sheet (each style); Picture page with picture mode open; a slider in live-adjust;
Sound output with Bluetooth connected; Wi-Fi list; a confirmation dialog; a page with greyed rows; HDR input (the
picture-mode list switches to the HDR set); an error rollback toast.

## 5. Open items

- **TV** reads listed in section 1 (permission groups, configd `systemUIManager`/`keyFilters` shape, live desc).
- Back delivery (3.4): which foreground apps accept Back, and whether the delivered key arrives as
  `Qt.Key_Back`/`Key_Escape` in QML (LG's QS listens for `Key_Escape` releases, `QuickSettings.qml:101`).
- Kit gaps: text field with the system keyboard; busy indicator.
- The owner decided (2026-10-28): our quick sheet replaces LG's Quick Settings (hook A), and the launch stub is in.
- A few catalog rows are marked `unknown` (exact params for picture reset, picture test, sound test, app locks);
  they are tier 3. The PIN change is resolved: LG's Settings writes `lock.systemPin` itself.
