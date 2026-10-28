(function (root) {
  var pack = {
    kind: 'style', id: 'bubble', name: 'Bubble',
    description: 'Clear white-tinted glass, rounded type, focus fills with each item\'s own colour.',
    font: { family: 'Fredoka', stack: 'Fredoka, sans-serif', google: 'Fredoka:wght@500;600;700',
      files: ['Fredoka/Fredoka-500.ttf', 'Fredoka/Fredoka-600.ttf', 'Fredoka/Fredoka-700.ttf'] },
    tokens: {
      'surface': 'rgba(255,255,255,0.18)', 'surface-edge': 'rgba(255,255,255,0.38)', 'inner': 'rgba(255,255,255,0.12)',
      'dim': 'rgba(24,14,48,0.50)', 'scrim': 'rgba(24,14,48,0.32)',
      'ink': '#FFFFFF', 'ink-2': 'rgba(255,255,255,0.90)', 'ink-3': 'rgba(255,255,255,0.78)', 'ink-disabled': 'rgba(255,255,255,0.50)', 'edge-disabled': 'rgba(255,255,255,0.40)',
      'shadow': '0 2px 10px rgba(0,0,0,0.55)',
      'focus': '#FFFFFF', 'focus-ink': '#1B0F2E', 'focus-edge': '#FFFFFF', 'current': '#FFFFFF',
      'attention': '#FF3D7F', 'attention-ink': '#FFFFFF', 'critical': '#FF5A5A', 'critical-ink': '#FFFFFF',
      'track': 'rgba(255,255,255,0.30)', 'knob': '#1B0F2E',
      'hue-0': '#FF7AA8', 'hue-1': '#FFB547', 'hue-2': '#5FD3A4', 'hue-3': '#5CB8FF', 'hue-4': '#B48CFF', 'hue-5': '#FF8A5C', 'hue-6': '#6FE0E8',
      'r-tile': '36px', 'r-panel': '40px', 'r-row': '24px', 'r-key': '20px',
      'surface-strong': 'rgba(46,26,82,0.86)', 'divider': 'rgba(255,255,255,0.18)', 'current-ink': '#1B0F2E', 'r-control': '999px',
      'safe-x': '96px', 'safe-y': '54px', 'space-xs': '8px', 'space-s': '14px', 'space-m': '22px', 'space-ml': '26px', 'space-l': '30px', 'space-lx': '36px', 'space-xl': '44px', 'space-xxl': '60px',
      'edge-w': '2px', 'focus-w': '5px', 'focus-scale': '1.04', 'current-w': '7px',
      'panel-w': '660px', 'dialog-w': '820px', 'toast-w': '780px', 'row-h': '92px', 'row-h-2': '108px', 'row-pad': '30px', 'section-h': '64px',
      'icon': '36px', 'icon-l': '48px', 'well': '76px', 'volume-w': '500px', 'volume-h': '96px', 'track-h': '14px', 'thumb': '36px', 'toggle-w': '80px', 'toggle-h': '44px', 'knob-size': '36px',
      'button-h': '84px', 'tile-w': '260px', 'tile-h': '196px', 'tile-pad': '26px',
      'elev-panel': '0 22px 56px rgba(24,8,56,0.45)', 'elev-focus': '0 14px 34px rgba(24,8,56,0.40)',
      'type-display': '68px', 'type-display-weight': '700', 'type-title': '42px', 'type-title-weight': '700', 'type-tile': '32px', 'type-tile-weight': '700',
      'type-label': '28px', 'type-label-weight': '600', 'type-category': '30px', 'type-category-weight': '600', 'type-value': '25px', 'type-value-weight': '500', 'type-body': '29px', 'type-body-weight': '500',
      'type-caption': '21px', 'type-caption-weight': '500', 'type-headline': '34px', 'type-headline-weight': '700', 'type-heading': '23px', 'type-heading-weight': '600', 'type-heading-case': 'none',
      'type-key': '19px', 'type-key-weight': '600', 'type-numeral': '44px', 'type-numeral-weight': '700',
      'motion-focus': '180ms', 'motion-value': '260ms', 'motion-enter': '420ms', 'motion-exit': '220ms',
      'ease-focus': 'cubic-bezier(0.34,1.56,0.64,1)', 'ease-enter': 'cubic-bezier(0.34,1.3,0.64,1)', 'ease-exit': 'cubic-bezier(0.4,0,1,1)', 'enter-shift': '64px'
    },
    behaviour: { focusFill: 'hue', textShadow: true }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
