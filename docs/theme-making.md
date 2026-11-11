# Making a theme or a style

How to add a look to the theme-pack layer without a TV. Everything here runs on a desktop: packs are data, the tests
check them, and the preview harness draws every screen with them. The full reference is the
[theme-pack README](../tools/theme-pack/README.md); this page is the route through it. Paths are under
`tools/theme-pack/`.

## Two kinds of pack

| | A style | A theme |
|---|---|---|
| File | `packs/styles/<id>.js` | `packs/themes/<id>.js` |
| What it is | The look of every component: colours, radii, sizes, type, motion | Decoration around components: glows, rings, artwork |
| How many are active | exactly one | any number, stacked |
| Made of | a value for every token in `TOKENS` (`packs/tokens.js`), a font, `behaviour.focusFill` | `recipes`, each drawing one ring on one decoration target |
| Existing ones | `smoke`, `bubble` | `glow` (any season), then by the calendar: `newyear`, `winter`, `valentine`, `stpatrick`, `spring`, `easter`, `fireworks`, `summer`, `autumn`, `halloween`, `thanksgiving`, `christmas`, `hanukkah` |

Most new looks are themes. Write a style only when the components themselves should change shape, colour or type.

## The rule themes live by

Each component is four layers: −1 back decoration, 0 the component as the style draws it, +1 front decoration, then
its attachments (chips, badges). **A theme owns −1 and +1 only.** Focus, state and meaning are in the origin, so the
UI is complete with every theme off, and a theme can never hide which row is focused. Decoration does not cover
text or a value. Later themes wrap further out.

## Where a theme shows up: group and season

Every theme names its group, which decides where the Look settings page lists it.

```js
group: 'seasonal', season: [{ from: '12-01', to: '12-25' }],
```

- `group` is `seasonal` (listed under the holiday and season themes, and eligible for automatic calendar mode) or
  `custom` (the plain themes list: `glow`, and any theme you make that is not tied to a date).
- `season` is a non-empty list of date windows, on seasonal themes only. Each entry is one of:
  - `{ from: 'MM-DD', to: 'MM-DD' }`: a fixed window, both days included. It crosses New Year when `from` is later in
    the year than `to` (`12-26` to `01-03`).
  - `{ rule: 'easter', before: N, after: N }`: Western Easter Sunday, widened by N days on each side.
  - `{ rule: 'hanukkah', before: N, after: N }`: the eight days from 25 Kislev; `before: 1` adds the evening of the
    first candle.
  - `{ rule: 'weekday', month: 11, weekday: 4, nth: 4, before: N, after: N }`: the nth given weekday of a month
    (`weekday` 0 is Sunday; `nth: -1` is the last one). This example is US Thanksgiving.

  `before` and `after` are whole days and default to 0. Windows may overlap other themes' windows: Winter, Christmas
  lights and Hanukkah all cover December. Automatic calendar mode treats the longest window covering today as the
  season and the shortest as the holiday, so keep a season's window longer than any holiday's.

## A recipe

```js
{ target: 'tile', slot: 'back', when: 'focused', outset: 24, cost: 'glow', fill: 'focus', radius: 56, blur: 16, opacity: 0.4 }
```

- `target`: one of `TARGETS` in `packs/tokens.js` (`screen`, `panel`, `ribbon`, `toast`, `dialog`, `row`, `tile`,
  `button`, `chip`, `badge`, `thumb`, `knob`, `radio`, `check`), or `*`. Each target lists the states it passes; a
  recipe's `when` can only use those. `*` with `when: 'focused'` reaches rows, tiles and buttons.
- `slot`: `back` (glow, shadow, plate, artwork) or `front` (rings, frost, corner pieces).
- `when`: `always`, `focused`, `current` or `disabled`.
- `outset`: how far the ring box reaches out from the component, in px: a number, `[top, right, bottom, left]`, or
  per state `{ rest, focused, current, disabled }`. Negative values reach in over the content.
- What it draws, exactly one of:
  - `fill` (a colour or a token name) with optional `radius` and `blur`: a soft glow. `cost: 'glow'`.
  - `stroke` and `strokeWidth`, optional `radius`: a crisp ring. `cost: 'static'`.
  - `asset`: a PNG in `packs/assets/<theme id>/`, rendered from the recipe's `html`. `cost: 'static'`.
- `radius` is px or a radius token (`r-row`, `r-tile`, `r-control`), which keeps the ring concentric in every style.
- `style` places the ring inside its outset box: `width` / `height` in px, and `left:auto` / `top:auto` /
  `right:auto` / `bottom:auto` to pick an edge. Edges take only `auto`.
- `cost` is required: `glow` is a blurred fill (a shader, paid each frame it moves or fades); everything else is
  `static`. Keep glows few and off anything that animates constantly.

Use token names (`focus`, `current`, `attention`, `ink`) rather than colours when the theme should suit any style,
as `glow` does. Use fixed colours when the theme is its own palette, as `winter` does.

## Artwork

The TV's compositor draws no HTML and has no SVG plugin, so art is committed as PNG.

1. Write the art as inline SVG in the recipe's `html`: one `<svg>`, or several placed with `left` / `top`. No
   `<div>`, no CSS backgrounds; draw gradients and glows inside the SVG.
2. Name the file in `asset`.
3. `node tools/theme-pack/render-assets.mjs` renders every asset (needs `rsvg-convert`) into
   `packs/assets/<theme id>/`. Commit the PNGs.

The tests fail when a PNG does not match its SVG and when a recipe names art the renderer can't draw.

## A style

Copy `packs/styles/smoke.js` and change values. Every token must be present (a test checks it). Values are CSS
syntax. The font is named with `font.family` and its static per-weight TTF files, committed under `packs/fonts/`
with the font's licence beside them (`sh tools/theme-pack/tv/fetch-fonts.sh` fetches from Google Fonts); the TV
never goes online for type. `behaviour.focusFill` is `'token'` (focus is the `focus` colour) or `'hue'` (focus takes
the component's own hue).

## Look at it

```sh
node tools/theme-pack/preview/render.mjs out/ --look smoke+mytheme
node tools/theme-pack/preview/render.mjs out/ --look bubble+mytheme --scene Kit --scene InputPicker
```

`out/index.html` is a contact sheet of every scene and state at 1920×1080. `Kit`, `KitForms` and `KitOverlays` show
every component; the other scenes are real surfaces (volume, input picker, toasts, alerts, Settings). The renderer
needs Qt 5's `qml` tool (`qml-qt5`, `qml`, or `QML_BIN`), Xvfb and Mesa. Check a theme against both styles, alone
and stacked with another theme.

What to look for: text and values never covered; focus obvious at three metres; nothing drawn over the picture's
edges that a viewer would mistake for content; disabled components quiet; the screen's overscan margins
(`safe-x`, `safe-y`) the only place screen-wide art sits.

## Check it

```sh
node --test tools/theme-pack/test/assets.test.js tools/theme-pack/test/kit.test.js   # packs as data: seconds
node --test tools/theme-pack/test/*.test.js                                          # everything: a few minutes
node tools/theme-pack/check-branch.mjs --render                                      # before merging
```

Packs are found by directory listing: a new file in `packs/themes/` or `packs/styles/` is picked up by the tests,
the preview and the package with no registration.

## On a TV

A theme needs no TV to be finished. To see it on one (rooted, Homebrew Channel, layer installed):

```sh
sh tools/theme-pack/tv/build-ipk.sh tools/theme-pack/dist
TV_HOST=<tv address> sh tools/theme-pack/tv/install-tv.sh tools/theme-pack/dist/*.ipk
```

and choose it in Settings, Look.

## If the kit lacks something

A theme can only decorate the targets the kit passes. If an idea needs a new target or a new state, that is a change
to the kit (`ui/Look/kit/`) and to `TARGETS`, with its test, and it must run on the TV's Qt 5.6 (ES5 only;
`test/qml-compat.test.js` checks). Keep that separate from the theme.
