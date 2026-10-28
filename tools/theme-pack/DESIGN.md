# Design language

One language for every surface our layer draws: the volume bar, the input picker, Quick Settings, toasts, dialogs,
the Look picker and our own Settings. A surface is composed only from the kit in `ui/Look/kit/` (imported with
`import Look 1.0`). The kit takes every value from the style's tokens (`TOKENS` in `runtime/theme-pack.js`), so a
surface that uses only the kit cannot drift from the others, and a style or theme change reaches all of them.

If a surface needs something the kit lacks, add it to the kit (and here), not to the surface.

The kit's contact sheet is `preview/scenes/Kit.qml` and `preview/scenes/KitOverlays.qml`.

## Two styles, one system

The system is fixed; styles change its values.

- **Smoke**: smoked glass. Dark translucent panels, hairline edges (1.5 px), hot-pink focus, lime for current. Calm,
  quick motion (140 ms focus, no overshoot), modest radii (16 px rows, 28 px panels), small-caps section headings.
- **Bubble**: friendly and bold. Light glass, rounder (24 px rows, 40 px panels), bigger rows, controls and type, thicker
  edges and focus edge. Focus fills with the item's own hue; motion overshoots a little (`ease-focus` springs).

## Surface

There is one material: **Surface** (`surface`, with `surface-edge` at `edge-w`, radius `r-panel`, the `elev-panel`
shadow under it). Panels, the volume rail, key caps, toasts and dialogs are all made of it.

- `surface` is for things beside the picture (side panels, the rail, tiles).
- `surface-strong` is denser, for things that land on top of whatever is showing (toasts, dialogs).
- Inside a panel, rows sit on `inner`: a lighter plate on the panel, never a second panel.
- Tiles float straight on the picture, so their plate is `surface`, edged.
- Dividers are `divider`.
- The text shadow of the HTML renderer (`behaviour.textShadow`) has no cheap equivalent in the compositor, so the kit
  draws none. Its surfaces are dense enough to read on.

## Scrim

What settles the picture behind a surface (**Scrim**).

- `dim`: an even veil (`dim`) under a modal dialog. Dialogs bring their own.
- `left`, `right`, `bottom`: a gradient from that edge, reaching `scrim` at the edge, under side panels and ribbons.

## Placement

Everything sits inside the TV safe area: `safe-x` (96) by `safe-y` (54) in from each edge. Nothing but theme
decoration goes outside it. A **Panel** takes one placement:

| placement | where | size | enters from |
|---|---|---|---|
| `side-left`, `side-right` | at that edge | `panel-w` wide, full safe height | that edge |
| `rail` | right edge, centred | 112 wide, 560 tall | the right |
| `ribbon` | bottom, full safe width | its content | below |
| `toast` | top-right corner | `toast-w` (compact: its text) | above |
| `center` | centred | `dialog-w` wide, its content | a short rise and grow |
| `full` | the whole safe area | | a short rise and grow |

- A ribbon is usually `bare`: no surface, its tiles straight on a `bottom` scrim. Its decoration target is `ribbon`.
- Toasts stack downward from the corner with `space-m` between them.
- A side panel pairs with a scrim from its edge; a dialog with `dim`.

## Row

Every list in every menu uses one row (**ListRow**):

```
| row-pad | icon (icon) | space-m | label            | space-m | value | trailing | row-pad |
|         |             |         | hint (optional)  |         |       |          |         |
```

- Height `row-h`, or `row-h-2` with a hint line. Rows are `space-s` apart. Radius `r-row`, plate `inner`.
- The icon takes the item's hue (`hue-0`..`hue-6`) and has no well; label is the `label` role, hint `caption`, value
  `value` in `ink-2`.
- The trailing control says what OK does:

| variant | trailing | OK / Left-Right |
|---|---|---|
| `nav` | chevron (a value before it, if set) | opens a page |
| `value` | value and chevron | opens a picker page of radio rows |
| `toggle` | **Toggle** | flips it |
| `radio` | **Radio** | chooses this one of several |
| `check` | **Check** | adds or removes this one of several |
| `slider` | **Slider** and its number | Left/Right step it |
| `stepper` | **Stepper**: ‹ value › and a dot per option | Left/Right step it, wrapping |
| `info` | the value only | not focusable |

- Choose by meaning: a setting that is on or off is a toggle; one choice of a few, shown in place, is a stepper (Quick
  Settings) or a radio list on its own page (Settings); several that can all be on are checks.
- A section header (**Section**, `heading` role in `ink-3`, `section-h` tall) starts each group. It is not focusable.
- **RowList** holds rows and headers. Rows that do not wholly fit are hidden, the list always stops with a whole row at
  its top, and a chevron at its foot says more is below. Lists never clip, so focus decoration is never cut.
- A page is a **Header** (an optional breadcrumb in the `heading` role, the `title`, an optional subtitle at the right
  in `caption`) above a RowList, with **KeyHints** at the foot.

## Tile

One tile (**Tile**), `tile-w` by `tile-h`, padding `tile-pad`, radius `r-tile`:

- the icon (1.25 × `icon`, in its hue) or a picture at the top left;
- an optional **Badge** at the top right ("Watching");
- the name (`tile` role) and a sub line (`caption`) at the bottom;
- an optional **Chip** pinned over the top-right corner ("2").

**TileRibbon** lays tiles in a row, `space-m` apart, with `{ separator: true }` for a divider. Focus scrolls into view
by half a tile beyond it.

## Focus, current, disabled

One treatment, drawn by **Plate** under every row, tile and button:

- **Focused**: the plate fills with `focus` (or, where the style's `behaviour.focusFill` is `hue`, the item's hue); ink
  turns `focus-ink`; a `focus-edge` ring of `focus-w` runs inside the edge; an `elev-focus` shadow lifts it; the item
  scales to `focus-scale` and is lifted above its neighbours (z), so its decoration is never covered. Controls on the
  fill invert (the toggle track goes `focus-ink`, the radio dot `focus-ink`, and so on).
- **Current** (what is in use now: the input you are watching, the open category): a `current` bar of `current-w` along
  the bottom. While focused, the fill says enough and the bar hides. Radios and checks show their own current state.
- **Disabled**: the plate stays, ink and icons turn `ink-disabled`, controls dim. Our menus skip disabled rows. When
  LG puts focus on one, it gets the focus ring and lift but no fill.
- Focus is never shown by theme decoration alone. Themes add to it (below); turning themes off loses nothing.

## Type

Roles, not sizes. Each role has a size token `type-<role>` and a weight token `type-<role>-weight`. A style names only
weights its font files carry (a test checks this). Every kit text is a **Label** with a role.

| role | use |
|---|---|
| `display` | the Settings app's own name |
| `title` | page, panel and dialog titles |
| `tile` | a tile's name |
| `label` | row labels, buttons, toast titles |
| `value` | values, key hint labels, toast messages under a title |
| `body` | dialog text |
| `caption` | hint lines, subtitles, tile sub lines |
| `heading` | section headers and breadcrumbs (`type-heading-case`: Smoke uppercase, Bubble as written) |
| `key` | the names on key caps |
| `numeral` | big numbers (the volume level) |

## Spacing

`space-xs` 8, `space-s` 12, `space-m` 20, `space-l` 28, `space-xl` 40, `space-xxl` 56 (Smoke; Bubble is a little
looser). Use them for every gap and padding: `space-s` between rows, `space-m` inside a row between its parts and
between tiles and toasts, `space-l` for panel padding, `space-xl` between key hints and on button sides, `space-xxl`
for dialog padding.

## Motion

| token | for |
|---|---|
| `motion-focus` + `ease-focus` | focus moving: fill cross-fade, scale, ring |
| `motion-value` + `ease-focus` | values changing: toggles, sliders, steppers, radios; lists and ribbons scrolling (with `ease-enter`) |
| `motion-enter` + `ease-enter` | panels arriving, scrims fading in |
| `motion-exit` + `ease-exit` | panels leaving (always quicker than arriving) |
| `enter-shift` | how far a panel travels as it arrives |

- Focus does not travel between items; the old item lets go and the new one takes it, so held keys stay crisp.
- A panel arrives from its own edge (Placement) with a fade; centred ones rise and grow from 96 %.
- A stepper's new value slides in from the side it came from.
- Easing tokens are CSS `cubic-bezier()` strings; the compositor reads them as `Easing.Bezier` (`Look.curve`).

## Key hints

**KeyHints** sit at the foot of a surface that takes keys: a key cap (Surface, pill, `key` role; arrows draw as arrows)
then what it does (`value`, `ink-2`), `space-xl` apart. Name only the keys that do something here, in the order
Move, Change/OK, Back.

## Keys (our own menus)

RowList, TileRibbon, ButtonRow and Dialog handle keys when they have focus: Up/Down (lists) or Left/Right (ribbons,
buttons) move over focusable items; OK emits `activated`; Left/Right on a slider or stepper row emits `adjusted`;
Back emits `back`. They never change their own model: the surface owns the data. Surfaces that mirror an LG item
instead set `currentIndex` from LG and take no focus. Key codes are mapped in one place, `kit/keys.js`.

## Decoration contract

Each piece is wrapped in `Decor` with a target and the states it passes. Themes write recipes against these:

| target | component | states |
|---|---|---|
| `screen` | **Screen**: the whole display, behind and in front of everything | |
| `panel` | Panel (side panels, the rail, Settings) | |
| `ribbon` | a bare Panel (the input picker's ribbon) | |
| `toast` | ToastCard | |
| `dialog` | Dialog's panel | |
| `row` | ListRow | focused, current, disabled |
| `tile` | Tile | focused, current, disabled |
| `button` | Button | focused, disabled |
| `chip` | Chip | |
| `badge` | Badge | |
| `thumb` | a Slider's thumb | disabled |
| `knob` | a Toggle's knob | disabled |
| `radio` | Radio | current (chosen), disabled |
| `check` | Check | current (checked), disabled |

- `*` with `when: focused` reaches rows, tiles and buttons only: leaf pieces never pass `focused`, so a slider in a
  focused row does not grow a second bloom.
- Attachments (a tile's chip) are drawn after the tile's front decoration, so a theme never covers them.
- The compositor draws recipes that name an `asset` or a `fill`; `html`-only recipes are the HTML renderer's alone.

## Using the kit

```qml
import Look 1.0

Screen {
    Scrim { kind: "left"; shown: menu.open }
    Panel {
        placement: "side-left"
        shown: menu.open
        Header { id: head; title: "Quick settings" }
        RowList {
            y: head.height; width: parent.width; height: parent.height - y
            model: [{ variant: "toggle", label: "Energy saving", icon: "leaf", hue: 2, on: true }]
        }
    }
}
```
