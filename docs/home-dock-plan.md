# Home dock: build plan

A Home of our own for webOS 4 (LG B9, `4.10.0-17`, Qt 5.6.2): a dock of inputs and apps along the bottom of the
screen, drawn by the theme-pack layer over whatever is playing, opened by the remote's Home key. Nothing is mounted
over LG's Home app and nothing restarts. Why it has to work this way is in [home-takeover.md](home-takeover.md).

Status: researched on the TV, not built. Paths below are under `tools/theme-pack/`.

## How a Home press reaches the dock

```
Home key ─▶ our key filter (first in the compositor's chain)
              │ short press                         │ held about 1 s, or anything fails
              ▼                                     ▼
   systemUIManager/launch {"appId":"dev.themepack.home"}       LG's Home
              ▼
   LG's system UI table ─▶ ui/Look/settings/HomeEntry.qml (draws nothing, unloads at once)
              ▼ SettingsBus.homeRequested
   ui/Look/parts/Home.qml: the dock
```

## 1. The key filter: `ui/home-key.js`

A plain ES5 script (no `let`, `const`, arrow functions; no QML). Names prefixed `themepack` so nothing collides in
the key filter's shared scope. It defines `function init() {}` and one handler, `(key, pressed, autoRepeat)`.

- Any key but `Qt.Key_Super_L` (Home): pass to the next filter. Menu and Recent stay LG's.
- Pass to the next filter as well when LG itself would not open Home: a modal alert is up, the ribbon access flags
  are off, or the settings service says Home is disabled. LG's handler then decides, as before.
- A first press (not a repeat) records the time and is consumed. Repeats are consumed.
- A release of a press we took: held about 1000 ms or longer opens LG's Home (the way out if the dock is ever
  broken); otherwise send `/launch` with `{"appId":"dev.themepack.home"}` to `com.webos.service.systemUIManager`, and
  open LG's Home if the reply is not `returnValue: true`.
- The whole handler is in try/catch; the catch passes the key on. A filter error must never cost a key.

Test it with node's `vm` and a fake scope (key constants, a bus caller that records, the access flags), in
`test/`: every other key passes, the disabled cases pass, short press launches ours, long press launches LG's, a
failed reply falls back, a throw passes the key on.

## 2. Installing the filter: in memory, from the layer

As `ui/Look/settings/SystemUiHook.qml` does for the overlay table:

- New list = our entry (`file`: plain filesystem path of `home-key.js` in this layer copy, no `file://`; `handler`:
  our handler's name) followed by LG's list from the compositor's settings object. Assign it to the key filter's
  list property.
- Re-apply when LG's list changes (its change signal on the settings object).
- `retire()` assigns LG's list back as a plain value (not a `Qt.binding`: its function would die with this layer on
  Qt 5.6), idempotently.
- No configd write. A reboot or a compositor restart gives LG's chain back.

Assigning the list makes every filter reload, and LG's `init` then re-sends its preload launches;
`QuickSettingsEntry.qml` already ignores preloads.

## 3. The overlay entry

- `SystemUiHook.qml` gets a list of extra entries to append to the table it already owns:
  `{ "id": "dev.themepack.home", "defaultWindowType": "overlay", "main": <url of HomeEntry.qml> }`. One hook owns the
  table; a second hook assigning it would fight the first.
- `ui/Look/settings/HomeEntry.qml`, modelled on `QuickSettingsEntry.qml`: on a `launch` event that is not a preload,
  emit a new `SettingsBus.homeRequested(params)` and call `parent.windowExit()`. If no dock is listening, launch LG's
  Home through a `Service` (`appId: Look.busName`) instead.

## 4. The part: `ui/Look/parts/Home.qml`

An own part (no `claims`: there is no LG item to replace), added to `parts` in `Layer.qml`.

- A `FocusScope` on the layer LG's popups use, holding key focus the way `parts/Settings.qml` does (its focus link
  and its borrowing of LG's popup plane).
- Two parts can now want that plane. Move the borrowing into one shared helper (suggested: `settings/Hold.qml`, a
  `QtObject` with `take()`, `give()` and a `yielded` signal) and have a holder announce on the bus before taking, so
  the other closes synchronously first. Otherwise the two restore the plane's `z` and `visible` in the wrong order
  and leave it hidden. Keep what `preview/tests/tst_SettingsNav.qml` checks on the Settings part (`focusChain`,
  `focusHandler` and its log).
- Open on `SettingsBus.homeRequested`; a second request while open closes. Back closes (the ribbon's `back()` and
  the key filter's back release). Close when the foreground app changes: one standing subscription to
  `applicationManager/getForegroundAppInfo`, whose first answer is the current state, not a change.
- `retire()` gives back focus, the plane and the key filter list.
- Pointer: a `MouseArea` over the ribbon for the magic remote, and a click outside closes.
- `probe`: `{ open, focus, tiles, keys }`, for the tests and the TV suite.

## 5. What the dock shows

Built only from the kit (`ui/Look/kit/`): `Scrim { kind: "bottom" }`, a bare `Panel`, `Header`, `Badge`,
`TileRibbon`, `KeyHints`.

- Content inset 96 px at the sides and 54 px at the bottom. A header row: "Inputs and apps" on the left; on the
  right a status badge ("Offline" when the network is down) and the clock. Hide the clock when the TV's year is
  clearly unset (a TV that has never had a network reads 2018 or so).
- One ribbon of tiles, 24 px apart, 190 px high: inputs 230 px wide, apps 220 px.
  - One tile per input, with its own hue and a port icon (reuse `iconFor` / `hueFor` from `parts/InputPicker.qml`).
    Sub-line "No signal", "Signal", or the format ("4K · 60 Hz") for the input being watched. The watched input
    carries the "Watching" badge and the current underline.
  - Apps the user installed (`removable` launch points), sub-line "App", with their own icon.
  - USB: enabled when a USB drive is attached, otherwise disabled with "No drive".
  - Settings (sub-line "System"): opens our Settings.
  - "LG Home": opens LG's Home, where LG's own apps live.
- Key hints: left/right "Move", OK "Switch", Back "Close".

OK on a tile launches its app id through `applicationManager/launch` and closes the dock.

## 6. The data

Bus calls, all answered for the layer's bus name (`Look.busName`) on the TV. Add each to `METHODS` in
`service/permissions.sh` if it is not there.

| Call | Shape (fields used) |
|---|---|
| `com.webos.service.eim/getAllInputStatus` | `devices: [{ id: "HDMI_1", label, port, appId: "com.webos.app.hdmi1", connected, activate, hdmiPlugIn, modified }]`. `label` is the user's own name for the input when `modified` is true |
| `com.webos.applicationManager/getForegroundAppInfo` | `{ appId, windowId, processId }` |
| `com.webos.applicationManager/listLaunchPoints` | `launchPoints: [{ id, title, icon (absolute path), largeIcon, systemApp, removable, launchPointId, iconColor }]` |
| `com.webos.service.attachedstoragemanager/listDevices` | `devices: [{ deviceId, deviceUri, deviceType, deviceName }]`; with no drive attached only internal types appear |
| `com.webos.service.tv.display/getHDMIInfo` | `{ HDMImode, width, height, frameRate, scanType }` |
| `com.webos.service.connectionmanager/getstatus` | `{ wired: { state }, wifi: { state, onInternet }, isInternetConnectionAvailable }` |
| `com.webos.applicationManager/launch` | `{ id, params }` |

Not verified: which app the USB tile should launch (`com.webos.app.photovideo` is the guess).

## 7. Preview and tests

- `preview/mocks/Preview/TvSettings.qml`: answer the calls above in `handle()`, and add
  `com.webos.service.eim` and `com.webos.service.attachedstoragemanager` to its service list.
- A scene, `preview/scenes/Home.qml`, and its states in `preview/states.mjs`.
- A test scene in `preview/tests/` in the style of `SettingsRequests.qml` (open, move, activate, Back, second Home
  closes, foreground change closes, Settings and Home never both hold the plane, retire restores the key filter
  list), run from `test/layer.test.js`.
- `node --test tools/theme-pack/test/*.test.js` must pass, `test/qml-compat.test.js` included.

## 8. On the TV

```sh
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh apply
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh reports
```

Check, in this order, with someone holding the remote: every other key still works; Home opens the dock; Back and a
second Home close it; a long Home opens LG's Home; a tile switches input; `apply` a second time and all of it still
works (the retire path); power-cycle and Home is ours again once the boot hook has run. If keys stop working, a
power cycle restores LG's chain.

## Order of work

1. Filter script and its node test.
2. In-memory install and restore, table entry, `HomeEntry.qml`, bus signal: Home key reaches a stub part that only
   reports. Prove this much on the TV before drawing anything.
3. Shared hold helper; Settings moved onto it with its tests still passing.
4. The dock, its mocks, scene and tests.
5. TV checks; update `home-takeover.md` and the theme-pack README.
