(function (root) {
  var FLAKE = 'M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5';
  function flake(x, y, s, o) {
    return '<svg style="position:absolute;left:' + x + 'px;top:' + y + 'px;opacity:' + o + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="#DDF1FF" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>';
  }
  var FIELD = [[40, 120, 28, .5], [210, 40, 20, .4], [330, 180, 34, .55], [520, 90, 22, .35], [640, 210, 26, .5], [780, 60, 30, .45],
    [930, 150, 20, .4], [1060, 240, 32, .5], [1240, 110, 24, .45], [1420, 200, 30, .5], [1600, 70, 22, .4], [1780, 170, 28, .5],
    [120, 520, 24, .4], [400, 560, 30, .5], [700, 530, 22, .35], [980, 500, 28, .5], [1300, 460, 20, .4], [1700, 520, 26, .45]]
    .map(function (f) { return flake(f[0], f[1], f[2], f[3]); }).join('');

  // Icicles hang from the top edge of the screen, inside the overscan margin where no controls sit.
  var ICICLES = (function () {
    var d = '', x = 0, lengths = [18, 34, 12, 26, 40, 16, 30, 22, 14, 36, 20, 28];
    for (var i = 0; x < 1920; i++) {
      var w = 24 + (i % 3) * 6, h = lengths[i % lengths.length];
      d += 'M' + x + ' 0L' + (x + w / 2) + ' ' + h + 'L' + (x + w) + ' 0Z';
      x += w + 10;
    }
    return '<svg width="1920" height="44" viewBox="0 0 1920 44" aria-hidden="true"><rect width="1920" height="5" fill="#EAF6FF" opacity="0.85"></rect>' +
      '<path d="' + d + '" fill="#D6EEFF" opacity="0.7"></path></svg>';
  })();

  var SNOWMAN = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">' +
    '<circle cx="20" cy="21" r="16" fill="#F7FBFF" stroke="#B9D6EC" stroke-width="1.5"></circle>' +
    '<circle cx="14.5" cy="17" r="2.2" fill="#1E2530"></circle><circle cx="25.5" cy="17" r="2.2" fill="#1E2530"></circle>' +
    '<path d="M20 20.5l9 2.5-9 1.6z" fill="#FF8A3D"></path>' +
    '<circle cx="14" cy="28" r="1.2" fill="#1E2530"></circle><circle cx="17.5" cy="29.6" r="1.2" fill="#1E2530"></circle>' +
    '<circle cx="22.5" cy="29.6" r="1.2" fill="#1E2530"></circle><circle cx="26" cy="28" r="1.2" fill="#1E2530"></circle></svg>';

  var FLAKE_KNOB = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#DDF1FF"></circle>' +
    '<g transform="translate(8 8)"><path d="' + FLAKE + '" fill="none" stroke="#3B7BB8" stroke-width="2" stroke-linecap="round"></path></g></svg>';

  var pack = {
    kind: 'theme', id: 'winter', name: 'Winter',
    description: 'Holiday: snow behind everything, icicles along the top edge, a snowman on sliders, snowflakes on switches, an icy glow on focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, style: 'overflow:hidden', html: FIELD },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, style: 'bottom:auto;height:44px', html: ICICLES },
      { target: '*', slot: 'back', when: 'focused', outset: 24, style: 'border-radius:56px;background:#9AD8FF;opacity:0.4;-webkit-filter:blur(16px);filter:blur(16px)',
        fill: '#9AD8FF', radius: 56, blur: 16, opacity: 0.4 },
      { target: '*', slot: 'front', when: 'focused', outset: [20, 0, 0, 20], style: 'right:auto;bottom:auto;width:36px;height:36px',
        html: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#EEF8FF" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>' },
      { target: 'thumb', slot: 'front', when: 'always', outset: 10, style: '', html: SNOWMAN, asset: 'thumb.png' },
      { target: 'knob', slot: 'front', when: 'always', outset: 4, style: '', html: FLAKE_KNOB },
      { target: 'chip', slot: 'back', when: 'always', outset: 14, style: 'opacity:0.85',
        html: '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#DDF1FF" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
