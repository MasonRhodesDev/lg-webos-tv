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
shadow under it). Panels, the volume bar, key caps, toasts and dialogs are all made of it.

- `surface` is for things beside the picture (side panels, the volume bar, tiles, toasts).
- `surface-strong` is denser, for a style that needs it on top of busy content. The Smoke boards draw every panel,
  dialogs included, on `surface`; a dialog's `dim` settles the picture instead.
- Inside a panel, rows sit on `inner`: a lighter plate on the panel, never a second panel.
- Tiles float straight on the picture, so their plate is `surface`, edged.
- Dividers are **Divider**: `divider`, the edge width rounded up to a whole pixel, horizontal or `vertical`.
- The text shadow of the HTML renderer (`behaviour.textShadow`) has no cheap equivalent in the compositor, so the kit
  draws none. Its surfaces are dense enough to read on.

## Scrim

What settles the picture behind a surface (**Scrim**).

- `dim`: an even veil (`dim`) under a modal dialog. Dialogs bring their own.
- `left`, `right`, `bottom`: a gradient from that edge, reaching `scrim` at the edge, under side panels and ribbons. The
  `bottom` one is 480 tall and reaches full strength a third of the way down.

## Placement

Everything sits inside the TV safe area: `safe-x` (96) by `safe-y` (54) in from each edge. Nothing but theme
decoration goes outside it. A **Panel** takes one placement:

| placement | where | size | enters from |
|---|---|---|---|
| `side-left`, `side-right` | at that edge | `panel-w` wide, full safe height | that edge |
| `bar` | top-right corner | `volume-w` by `volume-h`, a pill | above |
| `ribbon` | bottom, full safe width | its content | below |
| `toast` | bottom-right corner, `safe-x` in from the right and the bottom | `toast-w` (compact: its text) | below |
| `center` | centred | `dialog-w` wide, its content | a short rise and grow |
| `full` | the whole safe area | | a short rise and grow |

- A ribbon is usually `bare`: no surface, its tiles straight on a `bottom` scrim. Its decoration target is `ribbon`.
- Toasts stack upward from the corner with `space-m` between them.
- The volume bar (SmokeOverlays board): the speaker icon, a **Slider** filling the rest, the level as a `numeral`
  right-aligned in a two-digit slot, `space-ml` apart, `space-lx` in from the ends. With no level to show (an external
  speaker, a device the TV cannot set) it shrinks to its icons; the mute indicator is the same pill, round.
- A toast (SmokeOverlays board): a `well` square plate (`inner`, edged, `r-tile`) holding a `icon-l` icon in its hue,
  `space-ml` from the title (`headline`) over the message (`body`, `ink-2`); `space-lx` padding; a chevron when it
  leads somewhere.
- A side panel pairs with a scrim from its edge; a dialog with `dim`.

## Row

Every list in every menu uses one row (**ListRow**):

```
| row-pad | icon (icon) | space-m | label            | space-m | value | trailing | row-pad |
|         |             |         | hint (optional)  |         |       |          |         |
```

- Height `row-h`, or `row-h-2` with a hint line (Smoke: both 96, as the boards draw them). Rows are `space-s` apart. Radius `r-row`, plate `inner`.
- The icon takes the item's hue (`hue-0`..`hue-6`) and has no well; label is the `label` role, hint `caption`, value
  `value` in `ink-2`.
- An optional `chip` (a count or alert) is an attachment centred on the row's top-right corner.
- The trailing control says what OK does:

| variant | trailing | OK / Left-Right |
|---|---|---|
| `nav` | chevron (a value before it, if set) | opens a page |
| `value` | value and chevron | opens a picker page of choice rows |
| `toggle` | **Toggle** | flips it |
| `radio` | **Radio** | chooses this one of several |
| `check` | **Check** | adds or removes this one of several |
| `slider` | **Slider** and its number | Left/Right step it |
| `stepper` | **Stepper**: ‹ value › and a dot per option | Left/Right step it, wrapping |
| `choice` | a tick in `current` when chosen | chooses this value and goes back (a picker page) |
| `action` | the value only, if any | does it (Screen off, Reset) |
| `category` | nothing; `row-h` less `space-xs` tall, no plate at rest unless current | shows that category |
| `info` | the value only | not focusable |

- `busy` on a row puts **Busy** (a turning three-quarter ring, the icon's size, in the row's soft ink) before its value
  while it scans or connects.

- Choose by meaning: a setting that is on or off is a toggle; one choice of several is a value row whose picker page
  lists choice rows (the Settings and Quick settings boards; the chosen one also has the `current` bar and the hint
  "Current"); a stepper shows one in place; several that can all be on are checks.
- A section header (**Section**, `heading` role in `ink-3`, `section-h` tall) starts each group. It is not focusable.
- **RowList** holds rows and headers. Rows that do not wholly fit are hidden, the list always stops with a whole row at
  its top, and a chevron at its foot says more is below. Lists never clip, so focus decoration is never cut.
- Live data: give RowList `rows` (the specs) and `model: rows.length`; a new `rows` of the same length updates the rows
  in place, so a toggle slides and focus stays. `pointer: true` (our own menus, while LG's pointer shows) lets the
  magic remote focus a row by hovering and activate it by a click.
- A page is a **Header** (an optional breadcrumb in the `label` role in `ink-3` with a trailing ›, the `title`, an
  optional subtitle at the right in `caption`) above a RowList, with **KeyHints** at the foot.

## Tile

One tile (**Tile**), `tile-w` by `tile-h`, padding `tile-pad`, radius `r-tile`:

- the icon (1.4 × `icon`, in its hue) or a picture at the top left;
- an optional **Badge** at the top right ("Watching"), an attachment;
- the name (`tile` role) and a sub line (`caption`) at the bottom;
- an optional **Chip**, an attachment centred on the top-right corner ("2"), anchor (100%, 0%).

**TileRibbon** lays tiles in a row, `space-m` apart, with `{ separator: true }` for a divider (`width` sizes its
slot). A tile with `heading` starts a group: the name (`heading` role, `ink-3`) sits `space-s` above it, and `lead`
adds space before it. Focus scrolls into view by half a tile beyond it. A ribbon that mirrors LG's (`follows: false`)
never scrolls or fades itself: its surface places it so its tiles sit over LG's.

## Focus, current, disabled

One treatment, drawn by **Plate** under every row, tile and button:

- **Focused**: the plate fills with `focus` (or, where the style's `behaviour.focusFill` is `hue`, the item's hue); ink
  turns `focus-ink`; a `focus-edge` ring of `focus-w` runs inside the edge; an `elev-focus` shadow lifts it; the item
  scales to `focus-scale` and its whole stack lifts above its neighbours (Layers), so its decoration is never covered. Controls on the
  fill invert (the toggle track goes `focus-ink`, the radio dot `focus-ink`, and so on).
- **Current** (what is in use now: the input you are watching, the open category): a `current` bar of `current-w` along
  the bottom. While focused, the fill says enough and the bar hides. Radios and checks show their own current state.
- **Disabled**: the plate stays, ink and icons turn `ink-disabled`, controls dim, and a dashed edge in `edge-disabled`
  runs inside it (an edged plate, a tile or button, trades its edge for it). Our menus skip disabled rows. When
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
| `headline` | toast titles, card headings (SmokeSpec's "heading" 32/700) |
| `label` | row labels, buttons |
| `category` | a category row's label in a side list (the Settings boards: 28, a step above `label`) |
| `value` | values, key hint labels |
| `body` | dialog text, toast messages |
| `caption` | hint lines, subtitles, tile sub lines |
| `heading` | section headers and breadcrumbs (`type-heading-case`: Smoke uppercase, Bubble as written) |
| `key` | the names on key hints' caps |
| `numeral` | big numbers (the volume level) |
| `entry` | the text being typed in a TextField |
| `cap`, `cap-word` | an on-screen keyboard's characters, and its word keys (Shift, Delete, Space, Done) |
| `pad` | a PIN keypad's keys |
| `prompt` | a text prompt's label and a field's count |

## Spacing

`space-xs` 8, `space-s` 12, `space-m` 20, `space-ml` 24, `space-l` 28, `space-lx` 32, `space-xl` 40, `space-xxl` 56
(Smoke; Bubble is a little looser). The boards use all of them. Use them for every gap and padding: `space-s` between rows, `space-m` inside a row between its parts and
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
instead set `currentIndex` from LG and take no focus, and their buttons set `pointer: false` so LG's mouse areas
under them take the clicks. Key codes are mapped in one place, `kit/keys.js`.

## Our Settings and the quick sheet

- **Settings** is one `full` panel (`space-xl` padding): the `display` title and the categories (`category` rows) in a
  column three quarters of `panel-w` wide, a rule, and the open page (Header and RowList). The current category has
  its plate and `current` bar; focus is in one column at a time. No scrim: the picture stays bright around it.
- The **quick sheet** is a `side-left` panel: Header ("Quick settings", the input as its subtitle), its rows, and
  KeyHints at the foot (Move, OK Change, BACK Close). A value's picker replaces the rows in the same panel, with the
  sheet as its breadcrumb.
- Pickers are pages of `choice` rows; confirmations are a Dialog with the safe button focused.

## Layers

The owner's canvas, page "Layer system", is the model; boards are cited by number.

- **Three layers and attachments** (board 1). Every component is −1 back decoration, 0 the origin, +1 front
  decoration, and its attachments. The origin is the component as the style draws it, states included; layout places
  it and every layer is measured from it. ±1 are the themes' alone. Attachments (Chip, Badge: counts, alert dots,
  tags) are child components anchored to the origin, out of layout, free to straddle its edge, and painted after its
  +1. Each has its own −1/0/+1, so a theme dresses a chip as it dresses a tile. Only origins take focus; an
  attachment is announced with its parent. Themes off hides ±1 only (board 6).
- **Outsets** (board 2). Each layer's box is four outsets from the origin's edges, per recipe, per side, and per state
  (`outset: { rest, focused, current, disabled }`, each a number or four). A change of state animates the outset over
  `motion-focus`. Layout never sees an outset, so a growing glow never moves a neighbour; overlap is settled by
  paint order. An attachment is placed by `anchor`, [x%, y%] of the origin, centred on it: a tile's chip sits at
  (100%, 0%), centred on the corner.
- **Paint order: passes and lift** (board 3, option C). Within a container, every resting component paints its −1,
  then every origin, then every +1, then every attachment, so no decoration covers a neighbour's chip or focus ring.
  The focused component leaves the passes and paints its whole stack (−1, 0, +1, attachments) last, so its glow
  spreads over its neighbours.
- **Nesting: escapes to the parent's margin** (board 5). A container's children paint their passes inside the
  container's origin: over its surface and its −1, under its +1. Their decoration and attachments are not clipped to
  the container's box and may reach into its margin (a panel's padding), so chips and glows read whole. Keep them
  within it; nothing clips them before the screen. The screen is the root component: its margin is the overscan
  inset (`safe-x` × `safe-y`), where decoration may go and content never does, and only the display's edge clips.
- **The screen's own decoration** (a theme's sky, snow, icicles, corner pieces) shows only while a surface in the
  Screen is showing, fading with it, and never over bare video.
- **States** (board 4) are the style's, drawn inside the origin, which never moves or resizes: rest, focused (the fill
  inverts), current (the bar), attention (an attached chip), disabled.

In the kit, **Passes** is the container: Screen's children and a Panel's content paint in passes. A `Decor` joins the
nearest Passes above it; one inside another component's origin (a toggle's knob in a row) stays part of that origin
and lifts with it. A Passes keeps its components' layers in planes beside its content (back, content, front, attach,
lift), so positioners lay out only origins and nothing clips. Each layer follows its origin's position, scale and
opacity through bindings, so an idle screen runs no script; scrolling or a focus scale re-evaluates only the
components that move. Rotation and `transform` lists are not followed: move and grow components with x, y and scale.
A Decor outside any Passes keeps its layers to itself, in the same order.

## Text entry and the PIN (the Keyboard and PIN prompt boards)

Both take the whole screen over a `dim` scrim, with nothing of the menu behind them (the menu's panel leaves while
they show).

- **Key**: one key cap, `key-w` by `key-h`, an edged `inner` Plate of radius `r-key`, its name in `cap`, `cap-word` or
  `pad`. Focus is the one focus treatment; the key that finishes (Done, Join) carries the `current` bar. Decorated as
  `button`.
- **Keyboard**: four rows of Keys `key-gap` apart, each row centred: letters (Shift for one capital), and "123" for
  digits and symbols (Shift there for more). Wide keys keep the board's proportions (Shift, Delete and 123 230/132 of a
  key, Space 760/132, Done 300/132). Up/Down go to the nearest key in the next row. Ours, not LG's Maliit keyboard:
  Maliit is a separate process with a Wayland surface of its own, summoned only by client apps' text inputs.
- **TextField**: a `surface` box `field-h` tall, radius `r-row`, `space-lx` in, the text in `entry` with a caret
  (`focus`, `focus-w` wide) after it; while it takes the keys its edge is `active-w` in `focus-edge`. A count
  ("9 / 20", `prompt`, `ink-3`) sits `space-ml` to its right when there is a limit. Secret text shows dots but the last
  character.
- **TextPrompt**: the `prompt` label `space-xs` × 2 over the TextField, centred in the space above the Keyboard, which
  sits on a `ribbon` panel (`space-lx` padding).
- **PinPad**: 1-9, Clear, 0, Delete in three columns `pad-w` wide, `space-xs` × 2 apart, `pad-key-h` tall.
- **PinPrompt**: a centred panel `pin-w` wide (`space-xxl` padding, `space-lx` between parts, decorated as `dialog`):
  a **Well** with the lock, the title, the reason (or, in `critical`, why the last PIN was refused), a slot per digit
  (`slot-w` by `slot-h`, `inner`, the next one with the `active-w` edge, filled ones a `slot-dot` dot), the PinPad.
- **Well**: an icon `well` across in a ring of its hue over a faint wash of it (dialogs and prompts).

## Decoration contract

Each piece is wrapped in `Decor` with a target and the states it passes. Themes write recipes against these:

| target | component | states |
|---|---|---|
| `screen` | **Screen**: the whole display, behind and in front of everything | |
| `panel` | Panel (side panels, the volume bar, Settings) | |
| `ribbon` | a bare Panel (the input picker's ribbon) | |
| `toast` | ToastCard | |
| `dialog` | Dialog's panel | |
| `row` | ListRow | focused, current, disabled |
| `tile` | Tile | focused, current, disabled |
| `button` | Button | focused, disabled |
| `chip` | Chip | |
| `badge` | Badge | |
| `thumb` | the end of a Slider's fill (the boards draw no thumb; only themes do) | disabled |
| `knob` | a Toggle's knob | disabled |
| `radio` | Radio | current (chosen), disabled |
| `check` | Check | current (checked), disabled |

- `*` with `when: focused` reaches rows, tiles and buttons only: leaf pieces never pass `focused`, so a slider in a
  focused row does not grow a second bloom.
- Attachments (a tile's chip and badge, a row's chip) go in `Decor`'s `attachments` and paint after every +1 of their
  container (Layers). Chips and badges are targets of their own, so a theme dresses them as it dresses the tile.
- Back (−1) holds glow, shadow, plate, pattern, artwork and snow. Front (+1) holds the focus ring, frost, frames and
  sparkle. Neither covers text or a value: front pieces sit on edges and corners, outside the content padding, unless
  a negative outset opts in.
- State is the style's. Themes celebrate focus (a bloom behind, a ring or a sparkle in front) but never carry it, and
  they leave `current` to the style's bar, so Smoke's pink fill with its white edge and its lime bar stay the
  strongest signals. A chosen radio or check may glow. Decoration on a disabled component recedes with it: both
  renderers draw its rings at half opacity.
- Every recipe is drawn by both renderers: the compositor draws `asset`, `fill` (a glow) and `stroke` (a crisp ring);
  the HTML renderer draws `html` and `style`. A test rejects a recipe the compositor can't draw.
- Every recipe declares its `cost`: `static` (a texture or a rectangle, drawn once) or `glow` (a blur shader, which
  costs GPU each frame it moves or fades, as focus does). Nothing animates on its own yet; when something does, it
  will declare `motion` so a screen can cap how much moves at once.

What each theme gives each target (– is deliberate: the theme leaves it plain):

| target | Glow | Halloween | Winter |
|---|---|---|---|
| `screen` | light pooled in two corners | moonlit dusk and bats; cobwebs in the top corners | falling snow; icicles along the top |
| `panel` | halo | a spider hanging off its top-right | snow on its top edge |
| `ribbon` | a floor of light under the tiles | a graveyard in the bottom overscan strip | a snowbank in the bottom overscan strip |
| `toast` | halo | a bat off its top-left corner | snow on its top edge |
| `dialog` | halo | a lantern glow; a cobweb in its top-left corner | snow on its top edge |
| `row`, `button` focused | bloom and a halo ring | orange bloom | icy bloom and a frost flake |
| `tile` | focused: bloom and a halo ring | a cobweb on its top-right corner; focused: orange bloom | snow on its top edge; focused: icy bloom and a frost flake |
| `chip` | glows in its own colour | a pumpkin: orange rim and a stem | a snowflake behind, snow on top |
| `badge` | a soft glow | an orange rim | snow on top |
| `thumb` | a soft glow | a pumpkin | a snowman |
| `knob` | a soft glow | a spider | a snowflake |
| `radio`, `check` chosen | glows in the current colour | ember glow | icy glow |

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
