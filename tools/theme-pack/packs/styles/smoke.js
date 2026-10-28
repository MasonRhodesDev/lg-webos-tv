(function (root) {
  var pack = {
    kind: 'style', id: 'smoke', name: 'Smoke',
    description: 'Smoked glass over the picture, hot-pink focus, lime for current and attention.',
    font: { family: 'Lexend', stack: 'Lexend, sans-serif', google: 'Lexend:wght@400;500;600;700',
      files: ['Lexend/Lexend-400.ttf', 'Lexend/Lexend-500.ttf', 'Lexend/Lexend-600.ttf', 'Lexend/Lexend-700.ttf'] },
    tokens: {
      'surface': 'rgba(10,10,18,0.72)', 'surface-edge': 'rgba(255,255,255,0.22)', 'inner': 'rgba(255,255,255,0.08)',
      'dim': 'rgba(0,0,0,0.50)', 'scrim': 'rgba(0,0,0,0.20)',
      'ink': '#FFFFFF', 'ink-2': 'rgba(255,255,255,0.86)', 'ink-3': 'rgba(255,255,255,0.70)', 'ink-disabled': 'rgba(255,255,255,0.45)', 'edge-disabled': 'rgba(255,255,255,0.35)',
      'shadow': '0 2px 10px rgba(0,0,0,0.55)',
      'focus': '#FF4FA3', 'focus-ink': '#22000F', 'focus-edge': '#FFFFFF', 'current': '#C6FF3D',
      'attention': '#C6FF3D', 'attention-ink': '#16210A', 'critical': '#FF6B6B', 'critical-ink': '#2A0000',
      'track': 'rgba(255,255,255,0.28)', 'knob': '#16210A',
      'hue-0': '#FF7AA8', 'hue-1': '#FFB547', 'hue-2': '#5FD3A4', 'hue-3': '#5CB8FF', 'hue-4': '#B48CFF', 'hue-5': '#FF8A5C', 'hue-6': '#6FE0E8',
      'r-tile': '24px', 'r-panel': '28px', 'r-row': '16px', 'r-key': '14px',
      'surface-strong': 'rgba(12,12,20,0.88)', 'divider': 'rgba(255,255,255,0.10)', 'current-ink': '#16210A', 'r-control': '999px',
      'safe-x': '96px', 'safe-y': '54px', 'space-xs': '8px', 'space-s': '12px', 'space-m': '20px', 'space-ml': '24px', 'space-l': '28px', 'space-lx': '32px', 'space-xl': '40px', 'space-xxl': '56px',
      'edge-w': '1.5px', 'focus-w': '4px', 'focus-scale': '1.02', 'current-w': '7px',
      'panel-w': '640px', 'dialog-w': '800px', 'toast-w': '720px', 'row-h': '88px', 'row-h-2': '104px', 'row-pad': '28px', 'section-h': '60px',
      'icon': '34px', 'icon-l': '44px', 'well': '72px', 'volume-w': '480px', 'volume-h': '88px', 'track-h': '12px', 'thumb': '30px', 'toggle-w': '72px', 'toggle-h': '40px', 'knob-size': '32px',
      'button-h': '80px', 'tile-w': '260px', 'tile-h': '190px', 'tile-pad': '24px',
      'elev-panel': '0 24px 60px rgba(0,0,0,0.50)', 'elev-focus': '0 12px 30px rgba(0,0,0,0.45)',
      'type-display': '64px', 'type-display-weight': '700', 'type-title': '40px', 'type-title-weight': '700', 'type-tile': '30px', 'type-tile-weight': '700',
      'type-label': '26px', 'type-label-weight': '600', 'type-value': '24px', 'type-value-weight': '500', 'type-body': '26px', 'type-body-weight': '500',
      'type-caption': '20px', 'type-caption-weight': '500', 'type-headline': '32px', 'type-headline-weight': '700', 'type-heading': '19px', 'type-heading-weight': '600', 'type-heading-case': 'uppercase',
      'type-key': '18px', 'type-key-weight': '600', 'type-numeral': '40px', 'type-numeral-weight': '700',
      'motion-focus': '140ms', 'motion-value': '200ms', 'motion-enter': '320ms', 'motion-exit': '200ms',
      'ease-focus': 'cubic-bezier(0.2,0,0,1)', 'ease-enter': 'cubic-bezier(0.05,0.7,0.1,1)', 'ease-exit': 'cubic-bezier(0.3,0,0.8,0.15)', 'enter-shift': '40px'
    },
    behaviour: { focusFill: 'token', textShadow: true }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
