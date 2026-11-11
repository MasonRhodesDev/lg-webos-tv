# Design

The UI layer in `tools/theme-pack/` was designed on a set of boards kept outside this repository. The code is the
record here: styles and themes live in `tools/theme-pack/packs/`, and the token list and the decoration targets in
`tools/theme-pack/packs/tokens.js`.

`node tools/theme-pack/export-previews.mjs OUT_DIR` renders preview shots of our surfaces in a few looks from the QML
kit (see the theme-pack README, "Export the canvas's pack page").

## Boards

| Board | Covers |
|---|---|
| `layers` | The layer system: anatomy, per-layer outsets, render order (board 3, option C), states, nesting, what each layer holds |
| `smoke` | Smoke, the TV style: the spec board (tokens, type, radii, states, components) and every screen |
| `mix` | Style × theme: the contract between them and the mix-and-match board |
| `style` | TV style: the Bubble, Jelly and Smoke glass studies |
| `parked` | Dropped style sketches and early drafts, with why |
| `pack` | Generated from code: our surfaces in a few looks (`export-previews.mjs`) |

## Status

Approved: the Smoke screens that have boards on the `smoke` board. Home dock, Input banner, Volume and toast, Input
picker, Hotkey popup, Quick settings, Input options, Notification center, Settings (Picture, Picture mode drill-in,
Sound, Connection, General, Accessibility, Support), Alert, PIN prompt, Keyboard, Screensaver, AirPlay receiver and
App launch. A screen without a board is not designed yet; Bubble changes Smoke's tokens only.

## Layer system

The model is on the `layers` board. In code it is `tools/theme-pack/ui/Look/Decor.qml` (one component's layers)
and `Passes.qml` (paint order), checked by `tools/theme-pack/preview/tests/Passes.qml` and `Decoration.qml`.
