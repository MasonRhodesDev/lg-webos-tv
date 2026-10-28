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

## Fonts on an offline TV

The demo loads fonts from Google Fonts. An offline TV can't, so the style falls back to its system stack. To ship real fonts, place the OFL-licensed font files next to the demo and add `@font-face` rules, then open the demo with `?fonts=none`.

## Put it on a TV

The demo ships as a webOS web app called **Look**. The build runs on any machine with internet; the TV only receives the finished package.

```sh
sh tools/theme-pack/tv/fetch-fonts.sh tools/theme-pack/fonts      # OFL fonts from Google Fonts, latin subset
sh tools/theme-pack/tv/build-ipk.sh tools/theme-pack/dist tools/theme-pack/fonts
TV_HOST=<tv address> sh tools/theme-pack/tv/install-tv.sh tools/theme-pack/dist/dev.themepack.look_0.1.0_all.ipk
```

`install-tv.sh` needs root SSH, which Homebrew Channel provides. It copies the package to `/tmp` on the TV and installs it with the TV's own `appInstallService`. Open **Look** from the home screen. Left and right switch screens, Back on Home closes the app.

In the app the UI draws over a stand-in gradient, not the live HDMI picture: a full-screen web app replaces the input while it runs.
