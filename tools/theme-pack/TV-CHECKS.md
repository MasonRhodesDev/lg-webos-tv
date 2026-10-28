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

Focus and Back (SETTINGS-PLAN.md 3.4)
- [ ] With the sheet or Settings open, Up/Down/OK reach our rows (LG's focus chain at layer 7), and focus returns to
      the app underneath on close (the live TV channel keys work again at once).
- [ ] Back over live TV and over an HDMI input: one page back, then closed. Over an app that refuses Back, our menu
      closes as LG goes Home. Record which foreground apps refuse it.
- [ ] Whether Back arrives as `Qt.Key_Back` or `Key_Escape` (both are mapped in `kit/keys.js`).
- [ ] The magic remote's pointer: rows follow it and a click activates (`keyFilter.cursorVisible`).

Known gaps against the Settings boards (for the category-pages wave)
- General, Connection, Accessibility and Support lack some of the boards' rows (Home dashboard, Screen saver, Reset,
  Wi-Fi/Bluetooth values, Greyscale, Invert colours, Audio description, Text size, Software update, Sound and Signal
  test, Privacy and terms); some hints and subtitles differ (General's version line, the quick sheet's "4K · 120 Hz").
- Look is a row on General; the boards have no Look category.
