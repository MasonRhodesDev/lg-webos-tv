# Getting our UI into webOS 4 without restarting anything

Notes on what was tried on an LG B9 (`Rockhopper release 4.10.0-17`, Qt 5.6.2), what works, what does not carry over
from newer webOS, and how our Home is built. Everything here was read or tried on the TV itself; LG's behaviour is
described, not quoted.

## The problem

The theme-pack UI layer used to load by restarting `surface-manager` with our QML first on its import path. The
restart blanks the screen for 11 to 17 s. With Quick Start+ on, every power-off reboots the TV in the background and
suspends it about 45 s after boot, so a layer loaded by a restart at standby was thrown away, and a restart in front of
someone is the blank screen. Turning Quick Start+ off is not a way out: HDMI-CEC stops waking the TV, and the TV then
cold-boots at power-on, which loses the layer just the same.

## What works: LG's system UI manager loads our QML

The compositor has a service that loads a QML file into itself on request. One call does it:

```sh
luna-send -n 1 luna://com.webos.service.systemUIManager/launch \
  '{"appId":"<an id not used before>","main":"file:///path/to/File.qml","defaultWindowType":"overlay","windowType":"_WEBOS_SYSTEM_UI_TYPE_OVERLAY"}'
```

- The file is loaded inside a `StarfishSystemUIContainer` in LG's overlay view. Nothing is shown unless the file calls
  `windowShow()`, and `parent.windowExit()` unloads it.
- From the loaded item, walking `parent` upwards reaches LG's root (`YSM`), the ancestor with a child whose
  `objectName` is `systemUIManager`. Anything created under that root is in the same place as a layer loaded by the
  old restart method.
- The container announces its life cycle through `lifeCycleStatusChanged(payload)`: `register`, `launch`, `close`.
- An object made with `Qt.createComponent` from a QML file lives in that file's context, and in Qt 5.6 its bindings
  stop when the file is unloaded. Made from a `.pragma library` script, it lives in the engine's root context and
  stays. A local Qt 5.15 can't show the difference; only the TV can.
- The compositor keeps every QML file it has loaded, by path. A changed file has to be loaded from a new path.
- The service is `com.webos.service.systemUIManager`. `com.webos.service.sysuicompmgr` is a different thing.

`tools/theme-pack/ui/Inject.qml`, `ui/inject.js` and `webos/own-layer.sh apply` are built on this; see the theme-pack
README.

### Replacing a loaded layer: retire first

`apply` on a TV that already has a layer loads the new one beside the old and removes the old. Two rules came out of
getting that wrong:

1. **Compile first.** The new layer's component is compiled before the old one is touched. If it does not compile, the
   loaded layer stays and the error is reported.
2. **Retire, then create.** `destroy()` in QML is deferred to the end of the event loop turn. If undoing a part's
   changes to LG's tree is left to `Component.onDestruction`, the old layer's undo runs *after* the new layer has made
   the same changes, and takes them away again. So the old layer has a `retire()` that makes every part hand back what
   it changed (LG items made visible again, tables and bindings restored) synchronously, and every part's destruction
   is then a no-op. Each undo is idempotent.

A value handed back to LG must be a plain value, not a `Qt.binding` whose function belongs to the layer being
retired: on Qt 5.6 that function dies with the layer.

### Bus calls from inside the compositor

A bus client gets its permission groups when it connects. The compositor's `com.webos.surfacemanager.systemui`
connection comes out of the boot snapshot, before any boot hook can grant anything, so a service that checks groups
receives its calls and drops them unanswered. The compositor's role file
(`/usr/share/ls2/roles/prv/com.webos.surfacemanager.json`) allows it more names than LG's QML uses.
`com.webos.surfacemanager.wedge` is one of them: a `Service` with that `appId`, created after the grant and the bus
rescan, connects fresh and is answered. `tools/theme-pack/service/permissions.sh` derives the groups to grant from a
list of the methods the layer calls; a new call goes in that list.

### Replacing one of LG's system UI overlays

LG's system UI manager keeps a table of its overlays (Quick Settings, the input picker and so on): for each an id, a
window type and the QML file to load. The table is a plain property the layer can read and assign. The layer copies
it, points the Quick Settings entry at a file of ours, and assigns the copy; LG then loads our file whenever Quick
Settings is asked for, by the remote's key or by anyone's `systemUIManager/launch`. Our file draws nothing itself: it
tells the layer (through a singleton both import) that Quick Settings was requested and unloads. With no layer
listening it puts LG's entry back and loads LG's own file, so a missing layer never costs the key.

LG refreshes the table when its own settings change, so the hook re-applies on that signal, and `retire()` puts LG's
table back. This is `ui/Look/settings/SystemUiHook.qml` and `QuickSettingsEntry.qml`. A preload request (LG sends one
at startup and whenever the key filters reload) is ignored.

The same table takes *new* entries: an id of ours with a file of ours is then launchable by
`systemUIManager/launch '{"appId":"<our id>"}'` from anywhere, including a key filter. The manager answers
`returnValue: true` to a launch of any id, also one that is not in its table, so a caller cannot tell from the answer
whether anything loaded.

## The key filter chain

Every remote key passes through a chain of scripts in the compositor before any app sees it.

- The chain is a list of `{ handler, file }` entries (11 on this TV). configd holds it as
  `com.webos.surfacemanager.keyFilters`; the compositor's key filter object holds the live copy as a property, and
  assigning that property makes the compositor drop its timers and subscriptions and load every file in the list again.
- A filter file defines `init()` and its handler. The handler is called as `(key, pressed, autoRepeat)` and returns
  one of three policies: pass to the next filter, accepted (consumed), or not accepted.
- Filters run in the key filter's own scope, where LG's helpers are in reach: a bus caller (`send` and `subscribe`,
  taking the service name without `luna://`, the method with a leading slash and the payload as a string), a
  long-press timer, the application manager wrapper, the settings service and the access flags LG's own handlers
  consult.
- LG's Home handling takes Home, Menu and Recent. It does nothing while Home is disabled (first-use setup, hotel
  mode, an app that turned the ribbon off). A short press launches the Home app with `{"category":"home"}`; a long
  press launches it with `{"activateType":"recent"}`.
- Filters are plain scripts on Qt 5.6's ES5 engine: no `let`, `const` or arrow functions, and they should not create
  QML. Each file gets its own scope (LG's two files both define `init`).
- The bus caller in that scope calls as `com.webos.starfish.keyfilters`, a connection from the boot snapshot. Calls
  from it to LG's services are answered; calls to our own service never arrive, so a filter of ours cannot report.
- The chain runs in list order: the screen saver's wake-up, accessibility (a long Mute), AV reset and a broadcast
  helper come before LG's Home handling (`handleSystemKeys`).

Two ways to add a filter to the chain:

| | How | Lasts | Risk |
|---|---|---|---|
| configd | `setConfigs` on `com.webos.surfacemanager.keyFilters` | across reboots | a filter that swallows keys leaves the TV without a remote until someone gets in over SSH |
| in memory | assign the key filter's list from the layer, as with the overlay table | until the compositor restarts or the layer retires | a reboot clears it |

The layer uses the second: nothing persistent is written, the boot hook loads the layer at every boot anyway, and
power-cycling the TV always gives LG's own chain back. Assigning the list breaks its binding to configd's value, so the
layer follows configd's change signal itself while installed, and puts LG's list back as a plain value when it
retires.

## What does not carry over from webOS 6 and later

Glasshouse (a rooted-webOS server, MIT) replaces Home on newer TVs by mounting its own app over
`/usr/palm/applications/com.webos.app.home` and making sam read the new `appinfo.json` without a restart. Neither of
its two rescan triggers exists here:

| Lever | On this TV |
|---|---|
| configd `profile.blockedAppList` (webOS 7 to 9) | absent: `getConfigs` returns nothing, and `/usr/sbin/sam` doesn't contain the string |
| `applicationManager/blockSystemApp` (webOS 10, 11) | absent: not in the API permissions, no schema under `/etc/palm/schemas/sam/` |
| LG Home | `type: native`, `/usr/bin/com.webos.app.home`, restored from the boot snapshot before any hook runs |

Restarting sam is the remaining way to make it rescan, and glasshouse ties every one of its black-screen reports to
that restart.

What does carry over is its webOS 4 approach to the Home key: a generated filter, first in the chain, wrapped in
try/catch so an error always passes the key on, that launches its own home instead of LG's.

## Home: what is built

A key filter installed in memory takes the Home key and asks the system UI manager for an overlay entry of ours; the
entry tells the layer; the layer draws a dock of inputs and apps along the bottom of the screen, over whatever is
playing. A long press of Home still opens LG's Home, and so does any failure. The design and its pieces are in
[home-dock-plan.md](home-dock-plan.md); the files are described in the theme-pack README ("Our Home dock").

- Our filter goes just ahead of LG's `handleSystemKeys`, not first: the filters before it (the screen saver's wake-up
  above all) keep seeing every key first.
- Because the manager answers `true` to any id, the filter cannot detect a missing entry. Instead the layer installs
  the filter only while its system UI table holds our entry, and takes it out whenever the table goes back to LG's.
  With the entry present but no dock listening, the entry itself opens LG's Home.
- Our filter consumes the Home press, so LG's long-press timer never starts; the filter times the press itself and
  opens LG's Home on a release after about a second.

What opens when nothing is in front, and Back out of the last app, is LG's Home either way: neither goes through the
key chain.

## Leads not followed

Strings in `/usr/sbin/sam` name events it rescans on (`storageAttached` / `storageDetached`, a locale change,
`updateCompleted`, a new app list from LG's server). None was tried: the key filter gives the Home key without
touching sam.
