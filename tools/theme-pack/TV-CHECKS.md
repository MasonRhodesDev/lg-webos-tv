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
