(function (root) {
  var pack = {
    kind: 'style', id: 'smoke', name: 'Smoke',
    description: 'Smoked glass over the picture, hot-pink focus, lime for current and attention.',
    font: { family: 'Lexend', stack: 'Lexend, sans-serif', google: 'Lexend:wght@400;500;600;700' },
    tokens: {
      'surface': 'rgba(10,10,18,0.72)', 'surface-edge': 'rgba(255,255,255,0.22)', 'inner': 'rgba(255,255,255,0.08)',
      'dim': 'rgba(0,0,0,0.50)', 'scrim': 'rgba(0,0,0,0.20)',
      'ink': '#FFFFFF', 'ink-2': 'rgba(255,255,255,0.86)', 'ink-3': 'rgba(255,255,255,0.70)', 'ink-disabled': 'rgba(255,255,255,0.45)',
      'shadow': '0 2px 10px rgba(0,0,0,0.55)',
      'focus': '#FF4FA3', 'focus-ink': '#22000F', 'focus-edge': '#FFFFFF', 'current': '#C6FF3D',
      'attention': '#C6FF3D', 'attention-ink': '#16210A', 'critical': '#FF6B6B', 'critical-ink': '#2A0000',
      'track': 'rgba(255,255,255,0.28)', 'knob': '#16210A',
      'hue-0': '#FF7AA8', 'hue-1': '#FFB547', 'hue-2': '#5FD3A4', 'hue-3': '#5CB8FF', 'hue-4': '#B48CFF', 'hue-5': '#FF8A5C', 'hue-6': '#6FE0E8',
      'r-tile': '24px', 'r-panel': '28px', 'r-row': '16px', 'r-key': '14px'
    },
    behaviour: { focusFill: 'token', textShadow: true }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
