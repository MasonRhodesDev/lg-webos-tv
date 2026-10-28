(function (root) {
  var pack = {
    kind: 'style', id: 'bubble', name: 'Bubble',
    description: 'Clear white-tinted glass, rounded type, focus fills with each item\'s own colour.',
    font: { family: 'Fredoka', stack: 'Fredoka, sans-serif', google: 'Fredoka:wght@500;600;700' },
    tokens: {
      'surface': 'rgba(255,255,255,0.18)', 'surface-edge': 'rgba(255,255,255,0.38)', 'inner': 'rgba(255,255,255,0.12)',
      'dim': 'rgba(24,14,48,0.50)', 'scrim': 'rgba(24,14,48,0.32)',
      'ink': '#FFFFFF', 'ink-2': 'rgba(255,255,255,0.90)', 'ink-3': 'rgba(255,255,255,0.78)', 'ink-disabled': 'rgba(255,255,255,0.50)',
      'shadow': '0 2px 10px rgba(0,0,0,0.55)',
      'focus': '#FFFFFF', 'focus-ink': '#1B0F2E', 'focus-edge': '#FFFFFF', 'current': '#FFFFFF',
      'attention': '#FF3D7F', 'attention-ink': '#FFFFFF', 'critical': '#FF5A5A', 'critical-ink': '#FFFFFF',
      'track': 'rgba(255,255,255,0.30)', 'knob': '#1B0F2E',
      'hue-0': '#FF7AA8', 'hue-1': '#FFB547', 'hue-2': '#5FD3A4', 'hue-3': '#5CB8FF', 'hue-4': '#B48CFF', 'hue-5': '#FF8A5C', 'hue-6': '#6FE0E8',
      'r-tile': '36px', 'r-panel': '40px', 'r-row': '24px', 'r-key': '20px'
    },
    behaviour: { focusFill: 'hue', textShadow: true }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
