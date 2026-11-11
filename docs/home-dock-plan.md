# Home dock

A Home of our own for webOS 4 (LG B9, `4.10.0-17`, Qt 5.6.2): a dock of inputs and apps along the bottom of the
screen, drawn by the theme-pack layer over whatever is playing, opened by the remote's Home key. Nothing is mounted
over LG's Home app and nothing restarts. Why it has to work this way is in [home-takeover.md](home-takeover.md).

Status: built, and checked on the TV (the list and its results are in `tools/theme-pack/TV-CHECKS.md`, "Home dock").
Paths below are under `tools/theme-pack/`.

## How a Home press reaches the dock

```
Home key ─▶ our key filter (just ahead of LG's Home handling in the compositor's chain)
              │ short press                         │ held about 1 s, or anything fails
              ▼                                     ▼
   systemUIManager/launch {"appId":"dev.themepack.home"}       LG's Home
              ▼
   LG's system UI table ─▶ ui/Look/settings/HomeEntry.qml (draws nothing, unloads at once)
              ▼ SettingsBus.homeRequested
   ui/Look/parts/Home.qml: the dock
```

## 1. The key filter: `ui/home-key.js`

A plain ES5 script (no `let`, `const`, arrow functions; no QML). Its names are prefixed `themepack`. It defines an
empty `init()` and one handler, `themepackHandleHome(key, pressed, autoRepeat)`.

- Any key but `Qt.Key_Super_L` (Home) goes on to the next filter. Menu and Recent stay LG's.
- Home goes on to the next filter as well when LG itself would not open Home: a modal alert is up, the ribbon access
  flags are off, Home is disabled, the TV is in first-use setup (outside power-only mode), or LG's Home is showing.
  The decision is made on the press; its release and repeats follow it.
- A press we take records the time and is consumed; so are its repeats.
- On its release: held 1000 ms or longer opens LG's Home the way LG's own short press does (honouring a default app
  the settings name); otherwise it sends `/launch` with `{"appId":"dev.themepack.home"}` to
  `com.webos.service.systemUIManager`, and opens LG's Home if the reply is not `returnValue: true`.
- Everything is in try/catch. A press that throws goes on to LG; the release of a press we took that throws opens
  LG's Home (passing it on would reach LG without its press, and LG would do nothing).

The manager answers `true` even for an id it does not know, so the reply only catches a manager that is not there.
What keeps Home from launching nothing is step 2's rule: the filter is in the chain only while our entry is in the
table.

`test/home-key.test.js` runs the script in node's `vm` with a stand-in for the key filter's scope.

## 2. Installing the filter: in memory, from the layer

`ui/Look/settings/HomeKeyHook.qml`, owned by the dock's part:

- The new list is LG's list from the compositor's settings object with our entry (`file`: the plain filesystem path
  of `home-key.js` in this layer's copy; `handler`: `themepackHandleHome`) inserted just before LG's
  `handleSystemKeys`. It is assigned to the key filter's list property.
- It is made again when configd's list changes (the settings object's change signal), and waits for that list if it
  has not come yet.
- `restore()` assigns LG's list back as a plain value, idempotently.
- The part installs the filter only while Hook A's table holds our entry (`SettingsBus.hook` set and applied), and
  restores LG's list as soon as it does not (Hook A restored, the layer retiring).
- No configd write. A reboot or a compositor restart gives LG's chain back.

Assigning the list makes every filter reload, and LG's `init` then re-sends its preload launches; our entries ignore
preloads.

## 3. The overlay entry

- `SystemUiHook.qml` appends its `extra` entries to the table it owns:
  `{ "id": "dev.themepack.home", "defaultWindowType": "overlay", "main": <url of HomeEntry.qml> }`.
- `HomeEntry.qml`: on a `launch` that is not a preload it emits `SettingsBus.homeRequested(params)` and calls
  `parent.windowExit()`. With no dock listening (`SettingsBus.homeReady` false) it opens LG's Home through a
  `Service` (`appId: Look.busName`) instead.

## 4. The part: `ui/Look/parts/Home.qml`

An own part (no `claims`), in `parts` in `Layer.qml`.

- A `FocusScope` that, while open, holds focus in LG's focus chain at layer 7 and lives in LG's popup plane.
- The plane is borrowed through `settings/Hold.qml`, shared with `parts/Settings.qml`: `take()` first emits
  `SettingsBus.planeWanted(holder)`, a part holding the plane hears it, emits `yielded` and closes synchronously, and
  only then does the new holder take it. The plane's `z` and `visible` are always restored in the order taken.
- Each part reads LG's root (`host`) once, when created: while open it sits in the popup plane, and its parent chain
  no longer leads to the layer.
- Opens on `SettingsBus.homeRequested`; a request while open closes. Back closes (the ribbon's `back()` and the key
  filter's `backReleased`). It closes when the app in front changes: one standing subscription to
  `applicationManager/getForegroundAppInfo`, whose first answer records the current app.
- `retire()` closes it, gives back focus and the plane, and restores the key filter list.
- Pointer: a `MouseArea` over the ribbon (pointing focuses a tile, a click activates) and one behind the dock (a click
  outside closes).
- `probe`: `{ open, focus: { index, label }, tiles: [labels], keys }`.

## 5. What the dock shows

Built only from the kit (`ui/Look/kit/`): `Scrim { kind: "bottom" }`, a bare `Panel`, `Header`, `Badge`,
`TileRibbon`, `KeyHints`.

- Content inset 96 px at the sides and 54 px at the bottom. A header row: "Inputs and apps" on the left; on the right
  an "Offline" badge when the internet is down, and the clock, hidden while the TV's year is before 2020 (a TV that has
  never had a network reads 2018 or so).
- One ribbon of tiles, 24 px apart, 190 px high: inputs 230 px wide, the rest 220 px.
  - One tile per input, with its own hue and port icon (`parts/inputs.js`, shared with the input picker). Sub-line
    "No signal" or "Signal", or the format ("4K · 60 Hz") for the input being watched, which carries the "Watching"
    badge and the current underline.
  - Apps the user installed (`removable` launch points), sub-line "App", with their own icon.
  - USB: enabled when a USB drive is attached (named after it), otherwise disabled with "No drive".
  - Settings (sub-line "System"): opens our Settings.
  - "LG Home" (sub-line "LG's apps"): opens LG's Home, where LG's own apps live.
- Key hints: left/right "Move", OK "Switch", Back "Close".

OK on a tile launches its app id through `applicationManager/launch` and closes the dock.

## 6. The data

Bus calls, all answered for the layer's bus name (`Look.busName`) on the TV, each in `METHODS` in
`service/permissions.sh`.

| Call | Shape (fields used) |
|---|---|
| `com.webos.service.eim/getAllInputStatus` | `devices: [{ id: "HDMI_1", label, port, appId: "com.webos.app.hdmi1", connected, activate, hdmiPlugIn, modified }]`. `label` is the user's own name for the input when `modified` is true; `activate` is true while the input has a signal |
| `com.webos.applicationManager/getForegroundAppInfo` | `{ appId, windowId, processId }` |
| `com.webos.applicationManager/listLaunchPoints` | `launchPoints: [{ id, title, icon (absolute path), largeIcon, systemApp, removable, launchPointId, iconColor }]` |
| `com.webos.service.attachedstoragemanager/listDevices` | `devices: [{ deviceId, deviceUri, deviceType, deviceName }]`; with no drive attached only types starting with `internal` appear |
| `com.webos.service.tv.display/getHDMIInfo` | `{ HDMImode, width, height, frameRate, scanType }` |
| `com.webos.service.connectionmanager/getstatus` | `{ wired: { state }, wifi: { state, onInternet }, isInternetConnectionAvailable }` |
| `com.webos.applicationManager/launch` | `{ id, params }` |

The USB tile opens `com.webos.app.photovideo`; that it is the right app for a drive is not yet checked on the TV.

## 7. Preview and tests

- `preview/mocks/Preview/TvSettings.qml` answers the calls above, `com.webos.service.eim` and
  `com.webos.service.attachedstoragemanager` included, and makes a launched app the app in front.
- `preview/scenes/Home.qml` draws the dock; its states (an app focused, a USB drive attached, online) are declared in
  the scene, as for every scene.
- `preview/tests/tst_HomeDock.qml`, run by qmltestrunner from `test/layer.test.js`, drives the part with keys against
  a fake LG root: the filter in the chain and following configd, the table entry and its window, open, move, switch,
  Back, a second Home, a change of the app in front, Settings and Home never both holding the plane, and retiring
  (LG's chain back once, a second retire changing nothing).
- `node --test tools/theme-pack/test/*.test.js` passes, `test/qml-compat.test.js` included.

## 8. On the TV

```sh
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh apply
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh reports
```

After adding a bus method, run `service/permissions.sh` on the TV again and rescan the bus before `apply`. Check, in
this order, with someone holding the remote: every other key still works; Home opens the dock; Back and a second Home
close it; a long Home opens LG's Home; a tile switches input; `apply` a second time and all of it still works (the
retire path); power-cycle and Home is ours again once the boot hook has run. If keys stop working, a power cycle
restores LG's chain.
