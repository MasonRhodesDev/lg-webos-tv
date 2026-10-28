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
  var FROST = 'background:#EEF8FF;border-radius:999px';
  var pack = {
    kind: 'theme', id: 'winter', name: 'Winter',
    description: 'Holiday: snow falls behind everything, frost caps tiles, panels and chips, a flake marks focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, style: 'overflow:hidden', html: FIELD },
      { target: 'tile', slot: 'front', when: 'always', outset: [14, 8, 0, 8], style: 'bottom:auto;height:20px;' + FROST },
      { target: 'panel', slot: 'front', when: 'always', outset: [10, -24, 0, -24], style: 'bottom:auto;height:18px;opacity:0.9;' + FROST },
      { target: 'settings', slot: 'front', when: 'always', outset: [10, -40, 0, -40], style: 'bottom:auto;height:18px;opacity:0.9;' + FROST },
      { target: 'chip', slot: 'front', when: 'always', outset: [10, -4, 0, -4], style: 'bottom:auto;height:14px;' + FROST },
      { target: '*', slot: 'front', when: 'focused', outset: [38, 0, 0, 34], style: 'right:auto;bottom:auto;width:52px;height:52px',
        html: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#EEF8FF" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="' + FLAKE + '"></path></svg>' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
