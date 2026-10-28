// What a style and a theme are written against: the tokens every style defines, and the decoration targets theme
// recipes write to. Build tools and tests read this; on the TV the kit reads the same names (ui/Look/Look.qml keeps a
// stock value for every token, so the kit is whole before the Look service answers).

// Colour roles, radii, sizes, type, elevation and motion.
var TOKENS = [
  'surface', 'surface-edge', 'inner', 'dim', 'scrim',
  'ink', 'ink-2', 'ink-3', 'ink-disabled', 'edge-disabled', 'shadow',
  'focus', 'focus-ink', 'focus-edge', 'current',
  'attention', 'attention-ink', 'critical', 'critical-ink',
  'track', 'knob',
  'hue-0', 'hue-1', 'hue-2', 'hue-3', 'hue-4', 'hue-5', 'hue-6',
  'r-tile', 'r-panel', 'r-row', 'r-key',
  'surface-strong', 'divider', 'current-ink', 'r-control',
  'safe-x', 'safe-y', 'space-xs', 'space-s', 'space-m', 'space-ml', 'space-l', 'space-lx', 'space-xl', 'space-xxl',
  'edge-w', 'focus-w', 'focus-scale', 'current-w',
  'panel-w', 'dialog-w', 'toast-w', 'row-h', 'row-h-2', 'row-pad', 'section-h', 'icon', 'icon-l', 'well', 'volume-w', 'volume-h',
  'track-h', 'thumb', 'toggle-w', 'toggle-h', 'knob-size', 'button-h', 'tile-w', 'tile-h', 'tile-pad',
  'elev-panel', 'elev-focus',
  'type-display', 'type-display-weight', 'type-title', 'type-title-weight', 'type-tile', 'type-tile-weight',
  'type-label', 'type-label-weight', 'type-category', 'type-category-weight', 'type-value', 'type-value-weight', 'type-body', 'type-body-weight',
  'type-caption', 'type-caption-weight', 'type-headline', 'type-headline-weight', 'type-heading', 'type-heading-weight', 'type-heading-case',
  'type-key', 'type-key-weight', 'type-numeral', 'type-numeral-weight',
  // Text entry and PIN (the Keyboard and PIN prompt boards).
  'key-w', 'key-h', 'key-gap', 'field-h', 'active-w', 'pin-w', 'pad-w', 'pad-key-h', 'slot-w', 'slot-h', 'slot-dot',
  'type-entry', 'type-entry-weight', 'type-cap', 'type-cap-weight', 'type-cap-word', 'type-cap-word-weight',
  'type-pad', 'type-pad-weight', 'type-prompt', 'type-prompt-weight',
  'motion-focus', 'motion-value', 'motion-enter', 'motion-exit', 'ease-focus', 'ease-enter', 'ease-exit', 'enter-shift'
];

// The decoration contract: each target, the kit component wrapped in a Decor with it, and the states that Decor
// passes (a recipe's `when` can only see those). A recipe's target is one of these or `*`; `*` with `when: focused`
// reaches only rows, tiles and buttons, since leaf pieces never pass `focused` (a slider in a focused row grows no
// second bloom). The kit's Decors are checked against this list (test/assets.test.js).
var TARGETS = {
  screen: { component: 'Screen: the whole display, behind and in front of every surface', states: [] },
  panel: { component: 'Panel: side panels, the volume bar, Settings', states: [] },
  ribbon: { component: 'a bare Panel: the input picker\'s ribbon', states: [] },
  toast: { component: 'ToastCard', states: [] },
  dialog: { component: 'Dialog\'s panel, PinPrompt', states: [] },
  row: { component: 'ListRow', states: ['focused', 'current', 'disabled'] },
  tile: { component: 'Tile', states: ['focused', 'current', 'disabled'] },
  button: { component: 'Button, Key', states: ['focused', 'disabled'] },
  chip: { component: 'Chip', states: [] },
  badge: { component: 'Badge', states: [] },
  thumb: { component: 'the end of a Slider\'s fill (only themes draw it)', states: ['disabled'] },
  knob: { component: 'a Toggle\'s knob', states: ['disabled'] },
  radio: { component: 'Radio (current: chosen)', states: ['current', 'disabled'] },
  check: { component: 'Check (current: checked)', states: ['current', 'disabled'] }
};

function missingTokens(style) {
  return TOKENS.filter(function (t) { return style.tokens[t] == null; });
}

module.exports = { TOKENS: TOKENS, TARGETS: TARGETS, missingTokens: missingTokens };
