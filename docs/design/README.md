# Design

The design source of truth for our TV UI layer (`tools/theme-pack/`) is a private Claude Design canvas,
"TV Launcher Redesign":
<private-artifact>

That link is the owner's private canvas; outsiders cannot open it. The boards and the theme code are the record:
the repo keeps no design maps or token docs. Styles and themes live in `tools/theme-pack/packs/`, the token list and
the decoration targets in `tools/theme-pack/packs/tokens.js`.

Snapshot: none committed yet. `node tools/theme-pack/export-previews.mjs OUT_DIR` renders the generated `pack` page's
shots from the QML kit (see the theme-pack README, "Export the canvas's pack page").

## Pages

| Page id | Covers |
|---|---|
| `layers` | The layer system: anatomy, per-layer outsets, render order (board 3, option C), states, nesting, what each layer holds |
| `smoke` | Smoke, the TV style: the spec board (tokens, type, radii, states, components) and every screen |
| `mix` | Style × theme: the contract between them and the mix-and-match board |
| `style` | TV style: the Bubble, Jelly and Smoke glass studies |
| `parked` | Dropped style sketches and early drafts, with why |
| `pack` | Generated from code: our surfaces in a few looks (`export-previews.mjs`) |

## Status

`approved`: the Smoke screens that have boards on the `smoke` page. Home dock, Input banner, Volume and toast, Input
picker, Hotkey popup, Quick settings, Input options, Notification center, Settings (Picture, Picture mode drill-in,
Sound, Connection, General, Accessibility, Support), Alert, PIN prompt, Keyboard, Screensaver, AirPlay receiver and
App launch. A screen without a board is not designed yet; Bubble changes Smoke's tokens only.

## Layer system

The model is the canvas's `layers` page (the `layer-system` skill describes the same model). In code it is
`tools/theme-pack/ui/Look/Decor.qml` (one component's layers) and `Passes.qml` (paint order), checked by
`tools/theme-pack/preview/tests/Passes.qml` and `Decoration.qml`.
