# TV checks

Everything here was built and tested off the TV (unit tests and the preview harness). These are the checks the TV
integration suite must run before any of it counts as working. Each lane appends its own section; tick an item only
with evidence from the TV (a log line, a capture, a luna answer).

## Settings stub (redirect)

Setup: `install-boot.sh install` on a TV with the Look package and our layer installed, then a reboot.

Boot mount
- [ ] `/tmp/themepack.log` after a cold boot says `settings stub mounted`, and `mount` lists the bind over
      `/usr/palm/applications/com.palm.app.settings`.
- [ ] With the layer missing (or failing to load) the log says `settings left stock (...)` and the Home tile opens
      LG's Settings. Same with the Look package removed.
- [ ] `install-boot.sh remove` unmounts, and the Home tile opens LG's Settings again without a reboot.
- [ ] SAM serves the stub's description, not a cached stock one:
      `luna-send -n 1 luna://com.webos.applicationManager/getAppInfo '{"id":"com.palm.app.settings"}'` shows
      version `1.0.0`, vendor `theme-pack`, no `usePrerendering`. If SAM still shows the stock description, check that
      a launch loads the stub through the `index.<locale>.html` links the hook creates (menu language set to a
      non-English language too), and note whether SAM ever prerenders it.
- [ ] Home's Settings tile still shows a Settings icon, not the Look app's (the stub ships `tv/icon.png`; if the tile
      reads it from the mounted folder, the fix is a stub icon of its own or the hook copying the TV's stock icon in).
- [ ] No stock Settings instance is resident after boot (`applicationManager/running` has no
      `com.palm.app.settings` before the first launch).

Launch shows nothing
- [ ] Home screen Settings tile: our Settings opens at its top page. Nothing of LG's Settings appears, no splash, no
      blank or black frame, no spinner (record the screen, step through the frames).
- [ ] The stub has left `applicationManager/running` within 1 s of the launch, and focus is in our Settings (Up/Down
      move its rows; keys are not swallowed by an invisible stub window).
- [ ] The live picture underneath does not blink or reload, on live TV and on an HDMI input.
- [ ] A launch while our Settings is already open does not close or reset it unexpectedly.
- [ ] With the Look service's process killed just before a launch, the launch still opens our Settings (the retry
      reaches the restarted service), or at worst the stub closes within 3 s with nothing on screen.

The Look app (Home's Look icon)
- [ ] After installing the Look package, Home shows the Look icon (`tv/icon.png`), and launching it opens our
      Settings at its Look page, with nothing of the app on screen (no splash, no frame) and the picture underneath
      unchanged; the app has left `applicationManager/running` within 1 s.
- [ ] The app's bus calls reach the Look service as `dev.themepack.look` (its own package), with no permission error
      in `/var/log/messages` (it is `"trustLevel": "trusted"`, as the stub and LG's stock Settings are).

Every deep link lands on the right page
- [ ] For every key of `settings/catalog.json` `lgTargets.map`:
      `luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.palm.app.settings","params":{"target":"<key>"}}'`
      opens our Settings on the page `settings/<category>.json` names for it (the last step of the path).
- [ ] An unknown target and no params both open the top of our Settings.
- [ ] The real callers, not just luna-send: Home's network hint (`network`), Bluetooth surround from Home
      connections (`Bluetooth`), the on-screen keyboard's voice-language link (`Language`), the live menu's
      no-zip-code guide (`Location`).
- [ ] A relaunch while the stub is still running (two launches 100 ms apart) ends on the second target.

Back
- [ ] After a deep link, Back goes through our Settings' own Back rule (SETTINGS-PLAN.md 3.4): one page back, then
      closed, and never lands on LG's Settings or reopens the stub.
- [ ] Back over an app that refuses Back: our Settings closes and Home opens; no stub window is left behind.
- [ ] Exit and Home close it from a deep-linked page as from the top.

## Settings core (our Settings, the quick sheet, Hook A)

Setup: our layer applied (`own-layer-tv.sh apply`), the Look package installed, `service/permissions.sh` run and the
bus rescanned. Reports: `luna-send -n 1 luna://dev.themepack.look.service/getReports '{}'`.

Host and boot order
- [ ] The reports have `ready` "settings: host ready" within a few seconds of `layer created`. It means the host and
      Hook A are both live; a host whose hook failed reports `gap` "settings: host up, but Hook A is not applied".
- [ ] `/tmp/themepack.log` after a cold boot says `settings stub mounted` only after that report; with
      `parts/Settings.qml` removed from `Layer.qml` (or broken) it says `settings left stock (our Settings host never
      reported ready)` and the Home tile opens LG's Settings.

Bus identity (SETTINGS-PLAN.md section 1)
- [ ] `permissions.sh` prints `compositor groups: ...` naming the settingsservice, tv.time, tv.display,
      connectionmanager, audio, tvpower, notification and applicationManager groups it found in
      `/usr/share/luna-service2/api-permissions.d`. Record the list.
- [ ] After `ls-control scan-services` and a compositor restart, our Settings reads values (Picture mode shows the
      TV's real mode) and a write sticks: change Sound out in our Settings, then
      `luna-send -n 1 luna://com.webos.settingsservice/getSystemSettings '{"category":"sound","keys":["soundOutput"]}'`.
- [ ] If ls-hubd refuses groups from the dev directory (writes fail with a permission error, reported as
      `settings: <ref> not saved: ...` and a toast), switch `Store.qml`'s `appId` to `com.webos.app.quicksettings`
      (the plan's option 2) and note which writes still fail.
- [ ] The volume (`com.webos.audio getVolume/setVolume`) and Screen off (`com.webos.service.tvpower
      power/turnOffScreen`) calls are the right ones on this firmware: the quick sheet's Volume row follows the
      remote's volume keys, Left/Right change it, Screen off blanks the panel with sound on.

Hook A (the gear opens our quick sheet)
- [ ] The reports have `ok` "settings: the gear opens our quick sheet (system UI table)", not a `gap`.
      At boot it may first say `waiting` "settings: system UI table empty until configd answers"; `ok` and then
      `ready` "settings: host ready" must follow once configd answers.
- [ ] The gear opens our quick sheet, never LG's Quick Settings, also after the TV has been on for an hour (configd
      pushing a new `systemUIManager` would re-apply the table; check that it does not leave LG's entry).
- [ ] The gear again closes it; holding the gear does not flicker it open and shut.
- [ ] The picture-mode hotkey opens the sheet with the Picture mode picker; the sleep hotkey with the Sleep timer
      picker; `luna-send -n 1 luna://com.webos.surfacemanager/showQuickSettings '{}'` opens the sheet.
- [ ] No LG Quick Settings window is left behind (`luna-send -n 1 luna://com.webos.service.systemUIManager/getForegroundAppInfo '{}'`).
- [ ] QuickSettingsEntry.qml shares our engine: the sheet opens. If it does not, the reports say
      `settings: Quick Settings launched with no host listening; handed to LG's Quick Settings` and LG's Quick Settings
      opens instead (the fallback): check that it works fully (rows, pickers, Back, All Settings).
- [ ] With our part removed from `Layer.qml` after Hook A applied (or the layer reloaded), the gear opens LG's Quick
      Settings (the hook restores LG's table; report `LG's Quick Settings restored in the system UI table`).
- [ ] A write the TV never answers (e.g. before `permissions.sh` ran) rolls back after 5 s with a toast; the
      reports say `settings: <ref> not saved: the TV did not answer`.

Lists, forms and the PIN (all unverified on the TV; the shapes are read from LG's Settings bundle)
- [ ] `com.webos.service.wifi/findnetworks {subscribe}` answers `foundNetworks[].networkInfo` with `ssid`,
      `signalBars` (1-4?), `connectState` (`ipConfigured` when joined) and `availableSecurityTypes`; our Wi-Fi page
      lists the networks and marks the joined one current. `getstatus` says `serviceEnabled`/`serviceDisabled`.
- [ ] A join with a wrong password answers `errorCode` 10 (toast "the password is wrong"); how long a good join takes
      to answer (our timeout is 30 s, `Store.joinTimeout`, also used for Bluetooth pair, connect and disconnect).
- [ ] The Wi-Fi page starts `findnetworks` as soon as it opens (a read, as LG's does) and cancels it on close: check
      that the scan does not drop the current Wi-Fi connection while the page is open.
- [ ] Our bus identity holds the wifi and btaudiosrc groups (`permissions.sh` lists them).
- [ ] `com.webos.service.btaudiosrc`: `getPairedDevices` gives `devices [{address, name, state}]`; `startDiscovery
      {subscribe}` sends `{state: "started", device}` per device and `{state: "stopped"}`; `connect {address}` pairs a
      new device (LG's code does no separate pair call) and answers only once paired or refused.
- [ ] `getSystemSettings {category: "lock", keys: ["systemPin"]}` is readable by our identity (it is not in
      `settingsservice.allow`). If it is not, our PIN prompt refuses every PIN ("has not given us its PIN") and the
      locked rows stay closed; record it.
- [ ] Writing `lock.systemPin` with `initialPinCode: false` changes the PIN LG's own prompts ask for.
- [ ] Owner decision: our PIN prompt has no limit on wrong tries and no lockout.
      Decide whether to add one.
- [ ] Input locks: `lock.inputBlock` is a bitmask, bit `1 << i` for the i-th entry of LG's lockable input list
      (`getFinalLockableInputList`, built from `getExternalInputStatusList`); record that list's service and order
      before our Input locks page is built.
- [ ] App locks: the method that locks an app (the catalog guesses `com.webos.applicationManager lockApp {id, lock}`)
      before our App locks page is built.
- [ ] `network.deviceName` is a plain string, written as typed (phones show the new name).

Focus and Back (SETTINGS-PLAN.md 3.4)
- [ ] With the sheet or Settings open, Up/Down/OK reach our rows (LG's focus chain at layer 7), and focus returns to
      the app underneath on close (the live TV channel keys work again at once).
- [ ] Back over live TV and over an HDMI input: one page back, then closed. Over an app that refuses Back, our menu
      closes as LG goes Home. Record which foreground apps refuse it.
- [ ] Whether Back arrives as `Qt.Key_Back` or `Key_Escape` (both are mapped in `kit/keys.js`), and not as
      `Key_Backspace`: our keyboard and PIN pad take Backspace as erase, so a BACK that arrived as Backspace would erase
      instead of closing them. With nothing typed, BACK closes the TV name keyboard (Keyboard and text) and the PIN
      prompt of a locked page (tv-suite `back-in-prompts`).
- [ ] The magic remote's pointer: rows follow it and a click activates (`keyFilter.cursorVisible`).

Board content: the adapters behind the designed pages (UNVERIFIED reads, from LG's Settings bundle)
- [ ] `luna-send -n 1 luna://com.webos.service.tv.display/getHDMIInfo '{}'` on an HDMI input answers `width`, `height`,
      `frameRate` (in Hz) and `scanType`, and a subscription answers again when the source changes resolution or rate.
      The quick sheet and the Picture mode picker then read e.g. "HDMI 2 · 4K · 120 Hz"; on Live TV or an app, just
      the input.
- [ ] `luna://com.webos.service.tv.systemproperty/getSystemInfo '{"keys":["modelName","firmwareVersion"]}'` and
      `luna://com.palm.systemservice/osInfo/query '{"parameters":["core_os_release"]}'` answer for our appId. Record
      the values: the board writes "OLED55B9" and "webOS 4.5", and ours shows what the TV reports (expected
      "OLED55B9PUA" and "4.10.0"). Note whether `getSystemInfo` has an `sdkVersion` that reads "4.5".
- [ ] `luna://com.palm.systemservice/getPreferences '{"keys":["useNetworkTime"],"subscribe":true}'` answers and
      `setPreferences {useNetworkTime}` from Time and date's switch sticks (Time and date then reads Automatic/Manual).
- [ ] `getSystemSettings '{"category":"","keys":["eulaStatus","localeInfo"]}'` answers for our appId (eulaStatus is
      not in settingsservice.allow), with all eight of telemetry-off's `EULA_KEYS` as booleans.
- [ ] `luna-send -n 1 luna://dev.themepack.look.service/getTelemetry '{}'` says `"kit":"active"` after a cold boot
      with tools/telemetry-off installed (once its hook has run, ~35 s), `inactive` after
      `80-telemetry-off revert`, and that the service sees the root namespace's `/etc/hosts` (not a jail's stale copy:
      the marker must vanish after `revert`; a marker with the kit directory invisible answers `unknown`). The footer then reads "telemetry off", "agreements withdrawn" (kit not in
      force, agreements refused) or "telemetry on" (an agreement accepted).
- [ ] Device connector opens LG's connection wizard (`com.webos.app.connectionwizard`); Picture test and Sound test
      open LG's customer support app at those tests (`com.webos.app.customersupport {target}`); Back from each returns
      somewhere sensible (LG passes `appReturn` to Settings, which the stub redirects to ours).
- [ ] `permissions.sh` lists groups covering the new reads (tv.display getHDMIInfo, tv.systemproperty, systemservice).

Known gaps against the Settings boards (every row that differs from its board, and why)
- Picture: Pixel refresher shows no "At power off": no LG setting backs it (LG runs the refresh by itself).
- Sound: Balance's number is "0" / "L 2" / "R 2", not the board's position percent (the slider's number has room for
  three characters). Bluetooth surround greys with "Pair a Bluetooth speaker first" only while nothing is
  paired (`btPairedCount`); the boards disagree here (Sound greys it, Connection shows "1 paired"), and the mock
  follows Connection, so the Sound shot shows it live.
- Connection: the subtitle is the live "Offline"/"Online", not "Offline by design" (the TV cannot know it is by
  design). Internet has no "Blocked at the firewall by choice" hint, for the same reason. Screen Share is a link to
  its page, not a switch: LG 4.5 has no Screen Share on/off, only "Delete pairing history"
  (`miracast/deletePairedDeviceList`).
- General: the subtitle is "webOS 4.10.0 · 05.40.45" and About this TV "OLED55B9PUA": what the TV reports
  (`core_os_release`, `modelName`); "webOS 4.5" and "OLED55B9" are LG's product names (see the sdkVersion check
  above). Home dashboard has no "Inputs first" (no such LG setting). Screen saver reads "On" with an On/Off picker,
  not "After 5 minutes" (LG has only on/off).
- Accessibility: Greyscale, Invert colours and Text size are drawn in place, greyed, "Not on this TV's software":
  LG's 4.5 Settings bundle and the settings descriptions have no such settings.
- Support: TV information reads "OLED55B9PUA · webOS 4.10.0" (as General). Sound test launches LG's customer support
  app straight away, without LG's toast when the sound is not on the TV speakers.
- Quick sheet: none (Energy saving's state is the fixture's).
- Look follows General's seven board rows (the boards have no Look category).

Bluetooth (bluetooth2 for status, btaudiosrc for actions)
- [ ] The Bluetooth page lists the paired speakers from `luna://com.webos.service.bluetooth2/device/getStatus`
      (subscribed), with Connected where `connectedProfiles` is not empty, and follows a speaker turned on or off.
- [ ] The magic remote ("LGE MR19", BLE) is never listed and does not count in "N paired"; Bluetooth surround stays
      greyed with only the remote paired.
- [ ] These btaudiosrc calls, LG's own Settings' methods, answer from our identity (TV-unverified; a silent one rolls
      back after the timeout with a toast): `startDiscovery {subscribe}`, `connect {address}` (pair and connect),
      `disconnect {address}`, `removePairedDevice {address}`. If they go unanswered like `getPairedDevices`, the
      bluetooth2 equivalents to try are `adapter/startDiscovery`, `adapter/pair`, `a2dp/connect`, `a2dp/disconnect`,
      `adapter/unpair`.


## Home dock (the Home key, parts/Home.qml)

Setup: our layer applied (`own-layer-tv.sh apply`), `service/permissions.sh` run with the dock's methods and the bus
rescanned. Reports: `own-layer-tv.sh reports`. Someone holds the remote: the key filter is the one piece that can
cost keys, and a power cycle gives LG's chain back if it ever does.

Checked on an LG B9 (webOS 4.10) on 2026-11-11:
- [x] The reports have `ok` "home: the Home key opens our dock (key filter 5 of 12)": our filter sits just ahead of
      LG's `handleSystemKeys`, and LG's eleven filters are all still there.
- [x] Arrows, OK, Back and volume behave as before, with the dock closed.
- [x] A short Home opens the dock along the bottom (`home: requested (n)` in the reports); Back closes it; a second
      Home closes it.
- [x] Left and right move focus; OK on an input switches to it and closes the dock.
- [x] Holding Home about a second opens LG's Home.
- [x] The magic remote: pointing at a tile focuses it, a click switches, a click above the dock closes it.
- [x] Our quick sheet open, then Home: the sheet closes and the dock opens; the gear then closes the dock and opens
      the sheet; Back closes it.
- [x] A second `apply`: the reports have "home: LG's key filter chain restored" from the old layer, then the new
      layer's "the Home key opens our dock"; the dock opens, Back closes it, OK switches, the sheet and the dock hand
      over, other keys behave, and a long Home opens LG's Home. Also with our Settings open during the `apply`: it
      closes, and Home and the gear then open ours.
- [x] Power off with the remote, wait for the Quick Start+ background boot, power on: a short Home opens our dock.
- [x] The Settings tile opens our Settings; the "LG Home" tile opens LG's Home.
- [x] `luna-send -n 1 luna://com.webos.service.systemUIManager/launch '{"appId":"dev.themepack.home"}'` from SSH
      opens the dock too (a capture shows it).

Not checked yet
- [ ] With our layer gone (no `homeReady`), a launch of `dev.themepack.home` opens LG's Home (HomeEntry.qml's
      fallback).
- [ ] The USB tile with a drive attached: enabled, named after the drive, and OK opens `com.webos.app.photovideo`.

- [ ] A change of the app in front (a Netflix launch from a phone) closes an open dock.
