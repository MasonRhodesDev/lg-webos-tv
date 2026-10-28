(function (root) {
  // First snow: snow falling behind everything, icicles along the top of the screen and a snowbank along the bottom,
  // snow settling on the top edge of every surface, tile and tag, frost crystals and an icy glow at focus, a snowman
  // on every slider and snowflakes on the switches.
  var FLAKE = 'M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5';
  var ICE = '#9AD8FF';
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

  // A snowbank in the bottom overscan strip, under the input ribbon.
  var SNOWBANK = '<svg width="1920" height="54" viewBox="0 0 1920 54" aria-hidden="true">' +
    '<path d="M0 54V36C120 22 220 30 340 34S560 18 700 26S940 40 1060 30S1300 16 1440 28S1700 40 1820 26S1900 28 1920 30V54Z" fill="#B9D6EC" opacity="0.55"></path>' +
    '<path d="M0 54V42C160 32 300 40 460 40S760 30 900 38S1180 46 1340 38S1640 30 1780 40S1900 42 1920 40V54Z" fill="#F4FAFF" opacity="0.9"></path></svg>';

  // Snow lying on a top edge, its base along the edge: a long drift for surfaces, a short one for tiles and tags.
  function cap(w, h) {
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 140 30" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="M4 22C10 10 22 6 34 10C42 2 60 0 72 8C84 2 100 4 108 12C120 8 134 12 138 22C138 26 134 28 128 28H10C6 28 2 26 4 22Z" fill="#F4FAFF" stroke="#B9D6EC" stroke-width="1.2"></path>' +
      '<path d="M20 20C34 16 50 18 62 21M84 19C98 16 112 17 124 21" fill="none" stroke="#D6EEFF" stroke-width="1.4" stroke-linecap="round"></path></svg>';
  }

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
    description: 'Holiday: snow behind everything, icicles along the top and a snowbank along the bottom, snow on every surface and tile, a snowman on sliders, snowflakes on switches, an icy glow on focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, cost: 'static', style: 'overflow:hidden', html: FIELD, asset: 'snow.png' },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, cost: 'static', style: 'bottom:auto;height:44px', html: ICICLES, asset: 'icicles.png' },
      { target: 'panel', slot: 'front', when: 'always', outset: [22, 0, 0, -24], cost: 'static', style: 'right:auto;bottom:auto;width:140px;height:30px', html: cap(140, 30), asset: 'cap.png' },
      { target: 'toast', slot: 'front', when: 'always', outset: [22, 0, 0, -24], cost: 'static', style: 'right:auto;bottom:auto;width:140px;height:30px', html: cap(140, 30), asset: 'cap.png' },
      { target: 'dialog', slot: 'front', when: 'always', outset: [22, 0, 0, -24], cost: 'static', style: 'right:auto;bottom:auto;width:140px;height:30px', html: cap(140, 30), asset: 'cap.png' },
      { target: 'ribbon', slot: 'back', when: 'always', outset: [0, 96, 54, 96], cost: 'static', style: 'top:auto;height:54px', html: SNOWBANK, asset: 'snowbank.png' },
      { target: 'tile', slot: 'front', when: 'always', outset: [16, 0, 0, -18], cost: 'static', style: 'right:auto;bottom:auto;width:96px;height:22px', html: cap(96, 22), asset: 'cap-tile.png' },
      { target: '*', slot: 'back', when: 'focused', outset: 24, cost: 'glow', style: 'border-radius:56px;background:' + ICE + ';opacity:0.4;-webkit-filter:blur(16px);filter:blur(16px)',
        fill: ICE, radius: 56, blur: 16, opacity: 0.4 },
      { target: '*', slot: 'front', when: 'focused', outset: [20, 0, 0, 20], cost: 'static', style: 'right:auto;bottom:auto;width:36px;height:36px',
        html: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#EEF8FF" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>', asset: 'focus-flake.png' },
      { target: 'chip', slot: 'back', when: 'always', outset: 14, cost: 'static', style: 'opacity:0.85',
        html: '<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="#DDF1FF" stroke-width="1.2" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>', asset: 'chip-flake.png' },
      { target: 'chip', slot: 'front', when: 'always', outset: [9, 0, 0, 4], cost: 'static', style: 'right:auto;bottom:auto;width:42px;height:12px', html: cap(42, 12), asset: 'cap-small.png' },
      { target: 'badge', slot: 'front', when: 'always', outset: [9, 0, 0, 4], cost: 'static', style: 'right:auto;bottom:auto;width:42px;height:12px', html: cap(42, 12), asset: 'cap-small.png' },
      { target: 'thumb', slot: 'front', when: 'always', outset: 10, cost: 'static', style: '', html: SNOWMAN, asset: 'thumb.png' },
      { target: 'knob', slot: 'front', when: 'always', outset: 4, cost: 'static', style: '', html: FLAKE_KNOB, asset: 'knob.png' },
      { target: 'radio', slot: 'back', when: 'current', outset: 10, cost: 'glow', style: 'border-radius:999px;background:' + ICE + ';opacity:0.55;-webkit-filter:blur(8px);filter:blur(8px)',
        fill: ICE, radius: 999, blur: 8, opacity: 0.55 },
      { target: 'check', slot: 'back', when: 'current', outset: 10, cost: 'glow', style: 'border-radius:18px;background:' + ICE + ';opacity:0.55;-webkit-filter:blur(8px);filter:blur(8px)',
        fill: ICE, radius: 18, blur: 8, opacity: 0.55 }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
