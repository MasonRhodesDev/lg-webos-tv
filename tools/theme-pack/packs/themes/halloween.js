(function (root) {
  // Haunted night: a moonlit dusk with bats behind everything, cobwebs gathering in corners, a graveyard along the
  // bottom edge, jack-o'-lantern orange for light, spiders on the switches and a pumpkin on every slider.
  var INK = '#1A0F24';
  var BAT = 'M2 12c3-1 4-4 6-2 1-2 2.5-2 4 1 1.5-3 3-3 4-1 2-2 3 1 6 2-3 0-5 2-6 4-1-1.5-2.5-1.5-4 0-1.5-1.5-3-1.5-4 0-1-2-3-4-6-4z';
  function bat(x, y, s, o) {
    return '<svg style="position:absolute;left:' + x + 'px;top:' + y + 'px;opacity:' + o + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + BAT + '" fill="' + INK + '"></path></svg>';
  }
  // The dusk fades out by 60 % of the height; the moon (180 px, at 880, 70) carries its own halo.
  var SKY = '<svg style="position:absolute;left:0px;top:0px" width="1920" height="1080" viewBox="0 0 1920 1080" aria-hidden="true">' +
      '<defs><linearGradient id="tp-hw-dusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#280A3C" stop-opacity="0.35"></stop>' +
      '<stop offset="0.6" stop-color="#280A3C" stop-opacity="0"></stop></linearGradient></defs>' +
      '<rect width="1920" height="1080" fill="url(#tp-hw-dusk)"></rect></svg>' +
    '<svg style="position:absolute;left:790px;top:0px" width="360" height="340" viewBox="0 20 360 340" aria-hidden="true">' +
      '<defs><radialGradient id="tp-hw-halo"><stop offset="0.45" stop-color="#FFC878" stop-opacity="0.4"></stop>' +
      '<stop offset="1" stop-color="#FFC878" stop-opacity="0"></stop></radialGradient></defs>' +
      '<circle cx="180" cy="180" r="180" fill="url(#tp-hw-halo)"></circle>' +
      '<circle cx="180" cy="180" r="90" fill="#FFE7B0" opacity="0.85"></circle>' +
      '<circle cx="152" cy="160" r="16" fill="#F1D296" opacity="0.6"></circle><circle cx="205" cy="205" r="11" fill="#F1D296" opacity="0.55"></circle>' +
      '<circle cx="200" cy="140" r="7" fill="#F1D296" opacity="0.5"></circle></svg>' +
    bat(780, 110, 70, 0.9) + bat(1110, 230, 54, 0.85) + bat(980, 300, 40, 0.8) + bat(300, 90, 48, 0.7) + bat(1560, 160, 36, 0.6);

  function web(size, flip, stroke) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 76 76" fill="none" stroke="' + stroke + '" stroke-width="1.4" aria-hidden="true"' +
      (flip ? ' style="-webkit-transform:scaleX(-1);transform:scaleX(-1)"' : '') + '>' +
      '<path d="M76 0L20 0M76 0L76 56M76 0L30 46M76 0L50 54M76 0L22 22M60 0c0 10 6 16 16 16M44 0c0 18 14 32 32 32M30 0c0 26 20 46 46 46"></path></svg>';
  }
  var SPIDER = '<svg width="44" height="170" viewBox="0 0 44 170" aria-hidden="true"><path d="M22 0v120" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"></path>' +
    '<circle cx="22" cy="132" r="12" fill="' + INK + '"></circle><circle cx="22" cy="117" r="7" fill="' + INK + '"></circle>' +
    '<path d="M10 126l-10-8M10 132H0M10 138l-10 8M34 126l10-8M34 132h10M34 138l10 8" stroke="' + INK + '" stroke-width="2.5" stroke-linecap="round"></path>' +
    '<circle cx="19.6" cy="116" r="1.5" fill="#FF8A1F"></circle><circle cx="24.4" cy="116" r="1.5" fill="#FF8A1F"></circle></svg>';
  var FLYING_BAT = '<svg width="56" height="28" viewBox="0 6 24 12" aria-hidden="true"><path d="' + BAT + '" fill="' + INK + '" stroke="rgba(255,200,120,0.55)" stroke-width="0.5"></path>' +
    '<circle cx="10.6" cy="12.4" r="0.6" fill="#FF8A1F"></circle><circle cx="13.4" cy="12.4" r="0.6" fill="#FF8A1F"></circle></svg>';
  var PUMPKIN = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">' +
    '<path d="M20 10c1-4 4-6 7-5-2 1-4 3-5 6z" fill="#3C6E2A"></path>' +
    '<ellipse cx="13" cy="24" rx="8" ry="11" fill="#D9631A"></ellipse><ellipse cx="27" cy="24" rx="8" ry="11" fill="#D9631A"></ellipse>' +
    '<ellipse cx="20" cy="24" rx="8.5" ry="12" fill="#F2841F"></ellipse>' +
    '<path d="M13 21l4 3h-4zM27 21l-4 3h4zM13 29c4 3.5 10 3.5 14 0l-2.5 1.2-2-1.2-2.5 1.2-2.5-1.2-2 1.2z" fill="#2A1400"></path></svg>';
  var SPIDER_KNOB = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">' +
    '<path d="M12 16L3 9M11 20H2M12 24l-9 7M28 16l9-7M29 20h9M28 24l9 7" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"></path>' +
    '<circle cx="20" cy="22" r="10" fill="' + INK + '"></circle><circle cx="20" cy="12" r="6" fill="' + INK + '"></circle>' +
    '<circle cx="17.6" cy="11" r="1.6" fill="#FF8A1F"></circle><circle cx="22.4" cy="11" r="1.6" fill="#FF8A1F"></circle></svg>';

  // A graveyard in the bottom overscan strip, under the input ribbon: a low hill, headstones and lit pumpkins.
  var GRAVEYARD = (function () {
    var stones = '', pumpkins = '';
    var at = [[150, 22, 18], [330, 30, 22], [610, 20, 16], [880, 26, 20], [1180, 22, 18], [1420, 32, 22], [1690, 24, 18]];
    for (var i = 0; i < at.length; i++) {
      var x = at[i][0], h = at[i][1], w = at[i][2];
      stones += 'M' + x + ' 54V' + (54 - h + w / 2) + 'a' + (w / 2) + ' ' + (w / 2) + ' 0 0 1 ' + w + ' 0V54Z';
    }
    var lit = [250, 760, 1300, 1820];
    for (var j = 0; j < lit.length; j++) {
      pumpkins += '<ellipse cx="' + lit[j] + '" cy="44" rx="9" ry="7" fill="#F2841F"></ellipse>' +
        '<path d="M' + (lit[j] - 4) + ' 43l2 2h-2zM' + (lit[j] + 4) + ' 43l-2 2h2z" fill="#2A1400"></path>';
    }
    return '<svg width="1920" height="54" viewBox="0 0 1920 54" aria-hidden="true">' +
      '<path d="M0 54V44C240 34 480 38 720 42S1200 30 1440 38S1800 46 1920 40V54Z" fill="' + INK + '" opacity="0.92"></path>' +
      '<path d="' + stones + '" fill="#2E2140"></path>' + pumpkins + '</svg>';
  })();

  var GLOW = '#FF8A1F';
  var pack = {
    kind: 'theme', id: 'halloween', name: 'Halloween',
    description: 'Holiday: a moon and bats behind everything, cobwebs in corners, a graveyard under the inputs, spiders on panels and switches, pumpkins on sliders and chips, an orange glow behind focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, cost: 'static', style: 'overflow:hidden', html: SKY, asset: 'sky.png' },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, cost: 'static', style: 'left:auto;bottom:auto;width:150px;height:150px', html: web(150, false, 'rgba(255,255,255,0.6)'), asset: 'corner-web-right.png' },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, cost: 'static', style: 'right:auto;bottom:auto;width:150px;height:150px', html: web(150, true, 'rgba(255,255,255,0.6)'), asset: 'corner-web-left.png' },
      { target: 'panel', slot: 'front', when: 'always', outset: [0, 52, 0, 0], cost: 'static', style: 'left:auto;bottom:auto;width:44px;height:170px', html: SPIDER, asset: 'spider.png' },
      { target: 'ribbon', slot: 'back', when: 'always', outset: [0, 96, 54, 96], cost: 'static', style: 'top:auto;height:54px', html: GRAVEYARD, asset: 'graveyard.png' },
      { target: 'toast', slot: 'front', when: 'always', outset: [24, 0, 0, 34], cost: 'static', style: 'right:auto;bottom:auto;width:56px;height:28px', html: FLYING_BAT, asset: 'toast-bat.png' },
      { target: 'dialog', slot: 'back', when: 'always', outset: 28, cost: 'glow', style: 'border-radius:72px;background:' + GLOW + ';opacity:0.2;-webkit-filter:blur(36px);filter:blur(36px)',
        fill: GLOW, radius: 72, blur: 36, opacity: 0.2 },
      { target: 'dialog', slot: 'front', when: 'always', outset: [8, 0, 0, 8], cost: 'static', style: 'right:auto;bottom:auto;width:64px;height:64px', html: web(64, true, 'rgba(255,255,255,0.55)'), asset: 'dialog-web.png' },
      { target: '*', slot: 'back', when: 'focused', outset: 26, cost: 'glow', style: 'border-radius:56px;background:' + GLOW + ';opacity:0.5;-webkit-filter:blur(16px);filter:blur(16px)',
        fill: GLOW, radius: 56, blur: 16, opacity: 0.5 },
      { target: 'tile', slot: 'front', when: 'always', outset: [20, 20, 0, 0], cost: 'static', style: 'left:auto;bottom:auto;width:44px;height:44px', html: web(44, false, 'rgba(255,255,255,0.75)'), asset: 'tile-web.png' },
      { target: 'chip', slot: 'back', when: 'always', outset: 6, cost: 'static', style: 'border-radius:999px;box-shadow:inset 0 0 0 6px ' + GLOW,
        stroke: GLOW, strokeWidth: 6, radius: 999 },
      { target: 'chip', slot: 'front', when: 'always', outset: [16, 0, 0, 0], cost: 'static', style: 'bottom:auto;height:16px;text-align:center',
        html: '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M6 16c0-6 1-11 6-14-1 4-2 9-2 14z" fill="#3C6E2A"></path></svg>', asset: 'chip-leaf.png' },
      { target: 'badge', slot: 'back', when: 'always', outset: 3, cost: 'static', style: 'border-radius:999px;box-shadow:inset 0 0 0 3px ' + GLOW,
        stroke: GLOW, strokeWidth: 3, radius: 999 },
      { target: 'thumb', slot: 'front', when: 'always', outset: 10, cost: 'static', style: '', html: PUMPKIN, asset: 'thumb.png' },
      { target: 'knob', slot: 'front', when: 'always', outset: 6, cost: 'static', style: '', html: SPIDER_KNOB, asset: 'knob.png' },
      { target: 'radio', slot: 'back', when: 'current', outset: 10, cost: 'glow', style: 'border-radius:999px;background:' + GLOW + ';opacity:0.55;-webkit-filter:blur(8px);filter:blur(8px)',
        fill: GLOW, radius: 999, blur: 8, opacity: 0.55 },
      { target: 'check', slot: 'back', when: 'current', outset: 10, cost: 'glow', style: 'border-radius:18px;background:' + GLOW + ';opacity:0.55;-webkit-filter:blur(8px);filter:blur(8px)',
        fill: GLOW, radius: 18, blur: 8, opacity: 0.55 }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
