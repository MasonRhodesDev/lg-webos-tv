# theme-pack

A swappable look for a 10-foot TV interface. One **style** sets how things look (typeface, palette, radii, how focus is drawn). Any number of **themes** add decoration on top (holiday eye candy and the like). Swap either one without touching the other.

The pack renders to plain HTML strings, so the same code drives the browser demo, the tests, and the exporter that writes Design-canvas boards. It targets the web engine on webOS 4.x TVs (Chromium 53), so it avoids flex `gap`, the `inset` shorthand, object spread, `?.` and `??`.

## Run the demo

Open `demo/index.html` in a browser. No build step and no server are needed.

| Query | Effect |
|---|---|
| `?style=smoke` | pick the style (`smoke`, `bubble`) |
| `?themes=glow,winter` | stack themes, inner to outer; empty for none |
| `?screen=look` | open a screen (`home`, `quick`, `look`, `alert`) |
| `?picture=URL` | image standing in for the HDMI picture; a flat gradient is used otherwise |
| `?fonts=none` | skip the Google Fonts link (use on an offline TV with local fonts) |

The **Look** screen is the on-device menu: arrow keys move focus, Enter selects a style or toggles a theme, and the choice is saved in `localStorage`. On a webOS remote the D-pad sends the same arrow keys.

## Layer model

Every component renders the same five elements, in this DOM order, every time:

```
wrapper            position: relative, no z-index (so it joins its container's paint passes)
├─ back slot   −1  theme rings, behind everything        z 1   (lifted: 11)
├─ origin       0  the component as the style draws it   z 2   (lifted: 12)
├─ front slot  +1  theme rings, over the origin          z 3   (lifted: 13)
└─ attach slot     child components such as the chip     z 4   (lifted: 14)
```

- The back and front slots are always present. With no themes they are empty: the "vacant decorators".
- Because the wrapper sets no z-index, siblings share one stacking context. All back slots paint first, then all origins, then all front slots, then all attachments. A container's origin uses `isolation: isolate`, so its children's passes stay inside it.
- A focused component is lifted: its four layers move to z 11–14 together.
- Meaning lives in the origin and its attachments. Turning themes off never hides focus, state or a chip.

## Style pack schema

```js
ThemePack.register({
  kind: 'style', id: 'smoke', name: 'Smoke',
  font: { family: 'Lexend', stack: "Lexend, sans-serif", google: 'Lexend:wght@400;500;600;700' },
  tokens: {                     // every style must define every key in ThemePack.TOKENS
    surface: 'rgba(10,10,18,0.72)', inner: 'rgba(255,255,255,0.08)', ...
  },
  behaviour: {
    focusFill: 'token',         // 'token': focus uses the focus token; 'hue': the item's own hue
    textShadow: true            // shadow under text on see-through surfaces
  }
});
```

Tokens become CSS variables (`surface` → `--tp-surface`). The full list is `ThemePack.TOKENS` in `runtime/theme-pack.js`.

## Theme pack schema

```js
ThemePack.register({
  kind: 'theme', id: 'winter', name: 'Winter',
  reads: ['focus'],             // tokens the recipes use; every style provides them
  recipes: [
    { target: 'tile', slot: 'front', when: 'always', outset: [14, 8, 0, 8], style: '...', html: '' },
    { target: 'screen', slot: 'back', when: 'always', outset: 0, style: '...', html: '<svg>...</svg>' }
  ]
});
```

- `target` is a component type or `*`. `slot` is `back` or `front`.
- `when` is `always`, `focused`, `current` or `disabled`.
- `outset` is a number or `[top, right, bottom, left]` in px, measured out from the origin. Negative values inset over the content.
- `style` is inline CSS for the ring element. It may use `var(--tp-…)` tokens.
- Themes listed later wrap further out: their back rings paint first, their front rings paint last.

## Export to the Design canvas

```sh
node tools/theme-pack/export-canvas.mjs --out OUT_DIR [--picture URL] [--style smoke] [--themes winter]
```

This writes one `.dc.html` board per screen. CSS variables are resolved to literal values so the boards paint while loading and stay editable in the canvas.

## Test

```sh
node --test tools/theme-pack/test/*.test.js
```

The tests check the layer model on the rendered HTML: slot order, ring order, vacant slots, focus lift, and that every theme's `reads` exist in every style.

`test/layer.test.js` runs the QML scenes in `preview/tests/` offscreen (for example the layer's late claims against a fake LG root). It needs Qt 5's `qml` tool, `qml-qt5` or whatever `QML_BIN` names, and is skipped without it.

`test/qml-compat.test.js` checks `ui/` against what the TV's compositor (Qt 5.6.2, an ES5 engine) can run: no ES2015+ syntax or library calls, no Qt 5.7+ types or properties, only the Qt modules the layer uses (QtQuick, QtQuick.Window, QtQml, QtGraphicalEffects), and every other import resolvable on the TV or in `ui/`. Code that breaks these rules runs fine in the preview, which is Qt 5.15, and fails silently on the TV. The TV's modules are listed in `test/fixtures/tv-qml.json`; `test/fixtures/tv-qml-inventory.mjs` rebuilds it from a TV's file listing and qmldir files (its header has the commands).

## Preview harness

`preview/` renders the compositor layer's parts off the TV. A scene in `preview/scenes/` mocks the LG item a part replaces, as the part sees it, and may declare QML `states` (a row focused, a picker open, a toast of each kind). `preview/Shot.qml` draws one scene in one state over a stand-in picture at 1920×1080, with the Look service answered from a payload like the service's own, and fails if a part doesn't `claims()` its mock.

```sh
node tools/theme-pack/preview/render.mjs [OUT_DIR] [--scene NAME]... [--jobs N]
```

renders every scene × state × style × theme set (no theme, then each theme alone) in parallel and writes the PNGs and `index.html`, a contact sheet grouped by scene and state, into `OUT_DIR` (default: a new directory under the OS temp dir). It exits non-zero and lists the QML errors if any shot fails. A scene whose part isn't written yet is listed as waiting, not rendered.

It needs Qt 5's `qml` tool with QtQuick and QtGraphicalEffects (`qml-qt5` or `qml` on `PATH`, or `QML_BIN`), Xvfb, and Mesa (software OpenGL). Shots render through OpenGL on a virtual display per worker, because Qt's software backend draws no ShaderEffect and theme glows would be missing. To run one shot by hand:

```sh
cd tools/theme-pack
Xvfb :5 -screen 0 1920x1080x24 &
DISPLAY=:5 LIBGL_ALWAYS_SOFTWARE=1 QT_FORCE_STDERR_LOGGING=1 QML2_IMPORT_PATH=$PWD/preview/mocks:$PWD/ui \
  qml-qt5 preview/Shot.qml -- $PWD/preview/scenes/VolumeBar.qml "$PAYLOAD_JSON" out.png muted
```

`QT_FORCE_STDERR_LOGGING=1` is needed or QML errors go to the journal instead. The shot grabs the window's content item, which leaves out the Window's own colour, so `Shot.qml` draws its own backdrop.

## Fonts on an offline TV

Each style names its font (`font.family`) and the files that draw it (`font.files`, relative to `packs/fonts/`). The files are committed, with each font's `OFL.txt` beside them (both fonts are SIL Open Font License 1.1), so the package carries them and the TV never goes online for type. They are static per-weight TrueType files: the compositor's Qt 5.6 FreeType reads no WOFF2, and Chromium 53 predates variable fonts. `sh tools/theme-pack/tv/fetch-fonts.sh` downloads them again from Google Fonts, for when a style's font or weights change.

The browser demo loads the same fonts from Google Fonts; open it with `?fonts=none` to see the fallback stack. The packaged app links the committed files instead, and the compositor layer loads them through `Look.font` (below).

## Put it on a TV

The demo ships as a webOS web app called **Look**. The build runs on any machine with internet; the TV only receives the finished package.

```sh
sh tools/theme-pack/tv/build-ipk.sh tools/theme-pack/dist
TV_HOST=<tv address> sh tools/theme-pack/tv/install-tv.sh tools/theme-pack/dist/dev.themepack.look_0.1.0_all.ipk
```

`install-tv.sh` needs root SSH, which Homebrew Channel provides. It copies the package to `/tmp` on the TV and installs it with the TV's own `appInstallService`. Open **Look** from the home screen. Left and right switch screens, Back on Home closes the app.

Launch parameters take the same keys as the demo's query string, so a screen and look can be opened remotely:

```sh
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"dev.themepack.look","params":{"screen":"look","themes":"halloween"}}'
```

Two packaging details matter on webOS 4.x. The `.ipk` must be a plain `ar` archive: GNU `ar` writes member names with a trailing slash, which the installer rejects ("Failed to extract package"), so `build-ipk.sh` writes the archive itself. The fonts must be static per-weight files: Chromium 53 predates variable fonts and would draw everything at one weight.

In the app the UI draws over a stand-in gradient, not the live HDMI picture: a full-screen web app replaces the input while it runs.

## The Settings stub

Our own Settings replaces LG's (see [SETTINGS-PLAN.md](SETTINGS-PLAN.md)). The compositor catches the remote's
settings keys, but some routes go straight to LG's Settings app (`com.palm.app.settings`) through the app manager: the
Home screen's Settings tile, and deep links from LG's apps (`{"target": "network"}`, `"Bluetooth"`, `"Language"`, ...).
The **Settings stub** catches those. It is a tiny web app of ours with LG's app id, which the boot hook bind-mounts
over LG's app folder. On every launch it reads the launch params, maps LG's `target` to our page id through
`settings/catalog.json`'s `lgTargets` map (no target, or one we don't know, opens the top of our Settings), calls
the Look service's `openSettings {"target": <page id>}`, and closes once that is answered. The Look service then tells
our layer (`Look.settingsRequested(target)`), which opens our Settings.

- It draws nothing: a transparent window and an empty, transparent page, no splash and no prerendering.
- A cold start of the Look service drops the call that woke it, so an unanswered call is sent once more after 1 s;
  after 3 s the stub closes regardless.
- It contains no LG code. `node tools/theme-pack/webos/settings-stub.mjs OUT_DIR` builds it (`webos/settings-stub/`
  plus `targets.js` from the catalog); `install-boot.sh` builds and installs it (see "Every boot").

Ask for our Settings by hand, the way the stub does:

```sh
luna-send -n 1 luna://dev.themepack.look.service/openSettings '{"target":"PictureMode"}'
luna-send -n 1 luna://dev.themepack.look.service/closeSettings '{}'
```

## Our UI layer in the compositor

The volume bar, the input picker and the rest of the system UI are QML inside the compositor (`surface-manager-starfish`). Instead of editing LG's files, `ui/` is a QML module tree that the compositor finds first on its import path:

- `ui/YSM` defines the compositor's root type, `YSM`, as LG's own `YSM.qml` with our layer added on top. LG's root loads it through `import YSM 1.0`, so no LG file is edited or mounted over.
- `ui/Look/Layer.qml` is our layer. Each part in `ui/Look/parts/` draws one component and names the LG item it replaces with `claims(item)`. The layer finds that item and makes it invisible, but leaves it running; the part reads it through `lg`. LG keeps deciding *when* (timeouts, the volume OSD setting, audio guidance); our component decides *how it looks*. If LG's item isn't found, LG's stays on screen and the gap is reported.
- `ui/Look/Look.qml` is the active style's tokens, font and themes, live from the Look service. `Look.font` is the style's font family, loaded from the files the Look package installs; parts set `font.family: Look.font` on their text. `Decor.qml` is the layer model (back rings, origin, front rings) and `Ring.qml` draws one recipe.
- Parts are written from scratch on those three, so a style and its themes reach every pixel they draw. To add one, add its file to `parts` in `Layer.qml`.
- Some LG items don't exist when the layer starts: system UI overlays (Quick Settings, the input picker) are created when opened and destroyed when closed, and the toast view arrives with the notification view, which loads late. A part for one of them sets `onDemand: true`. At startup it reports `waiting` instead of a gap. The layer connects `currentViewChanged` on LG's system UI views (the root's children that have `viewName` and `currentView`; LG sets `currentView` once the overlay is loaded and shown) and the root's `notificationViewChanged`. On each change it offers the new item, three levels deep (for the toast, the notification view's siblings), to the on-demand parts that hold nothing. A claim hides LG's item and sets `lg`, and the first one reports `ok`. When LG destroys the item, `lg` goes back to null by itself and the part hides until LG shows it again. Nothing polls or watches the tree: it costs one search per overlay opening.

```sh
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh apply    # copy ui/, restart the compositor with it
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh revert   # restart the compositor on stock
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh reports  # what the layer reported
TV_HOST=<tv address> sh tools/theme-pack/webos/own-layer-tv.sh capture out.png  # the on-screen UI, without the video
```

`apply` and `revert` take a lock on the TV, so several working copies can test in turn. `own-layer.sh` passes `QML2_IMPORT_PATH` to the compositor job only, so a plain restart is stock again. The root reports to the Look service as soon as it loads; if it doesn't within 60 s, the compositor is restarted on stock. Our layer is created separately from the root, so a broken layer leaves LG's UI running and reports its error. Read the reports with `luna-send -n 1 luna://dev.themepack.look.service/getReports '{}'` (the compositor's own QML warnings go nowhere). The compositor's QML calls the bus as `com.webos.surfacemanager.systemui`, a name in no permission group, so `service/permissions.sh` grants it the service's group.

### The design language and the kit

Every surface the layer draws is composed from one component kit, `ui/Look/kit/` (in the `Look` module): Screen, Panel,
Header, RowList and ListRow, Tile and TileRibbon, Toggle, Radio, Check, Slider, Stepper, Chip, Badge, Button and
ButtonRow, ToastCard, Dialog, Scrim, KeyHints, Icon and Label. [DESIGN.md](DESIGN.md) is the language they implement:
surface, placement, row and tile anatomy, focus, type, spacing, motion and the decoration targets themes write to.
`preview/scenes/Kit.qml` and `KitOverlays.qml` are its contact sheet; render them with `preview/Shot.qml`.

### Recipes the QML layer draws

The compositor can't draw HTML, and has no SVG plugin. A recipe is drawn by the QML layer when it names one of:

- `asset`: a PNG in the theme's asset pack, `packs/assets/<theme id>/`, fitted into the ring box at its own aspect.
- `fill` (a colour, or a token name such as `focus`), with optional `radius` and `blur` in px: a soft glow.

`opacity` applies to both. Recipes with only `html`/`style` are drawn by the HTML renderer alone.

The ring box is the outset box, as in CSS. The QML Ring also reads a recipe's placement from its `style`, so there is one source for both renderers (`ui/Look/place.js`): `width`/`height` in px size the ring, and `left:auto`/`top:auto` put it against the right/bottom edge (`right:auto`/`bottom:auto` against the left/top). Without a size it fills the box. Edges only take `auto`, since the outset sets them; the tests reject anything else.

`node tools/theme-pack/render-assets.mjs` renders each `asset` from its recipe's html (needs `rsvg-convert`); the PNGs are committed, so building doesn't need it. The html must be one `<svg>`, or a field of `<svg>`s placed with `left`/`top` (sized from the style, or the 1920×1080 screen for a `screen` target). It renders at the CSS size ×2, at the svg's own aspect (`width="100%"`: 128 px on the longer side), and a screen-wide box at ×1. The ring's style `opacity` is baked in. It lists the recipes it can't draw: html with a `<div>` or a CSS background (Halloween's moon and bats, for now).

## Every boot

The read-only system and the boot snapshot undo mounts and bus permissions at each power-on. `webos/60-themepack` is a Homebrew Channel boot hook that puts them back: bus permissions and a rescan, our UI layer in the compositor, then the Settings stub over LG's Settings app, only when the layer loaded and the Look service is installed (otherwise LG's Settings stays). It logs to `/tmp/themepack.log`.

```sh
TV_HOST=<tv address> sh tools/theme-pack/webos/install-boot.sh install   # build the stub, install it and the hook, run the hook
TV_HOST=<tv address> sh tools/theme-pack/webos/install-boot.sh remove    # remove both; LG's Settings is back at once
```

The layer step runs once `own-layer-tv.sh apply` has put the layer on the TV.
