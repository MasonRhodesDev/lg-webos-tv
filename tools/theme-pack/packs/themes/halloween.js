(function (root) {
  var BAT = 'M2 12c3-1 4-4 6-2 1-2 2.5-2 4 1 1.5-3 3-3 4-1 2-2 3 1 6 2-3 0-5 2-6 4-1-1.5-2.5-1.5-4 0-1.5-1.5-3-1.5-4 0-1-2-3-4-6-4z';
  function bat(x, y, s, o) {
    return '<svg style="position:absolute;left:' + x + 'px;top:' + y + 'px;opacity:' + o + '" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + BAT + '" fill="#1A0F24"></path></svg>';
  }
  var SKY = '<div style="position:absolute;left:880px;top:70px;width:180px;height:180px;border-radius:999px;background:#FFE7B0;opacity:0.85;box-shadow:0 0 80px 30px rgba(255,200,120,0.35)"></div>' +
    bat(780, 110, 70, .9) + bat(1110, 230, 54, .85) + bat(980, 300, 40, .8) + bat(300, 90, 48, .7);
  var WEB = '<svg width="76" height="76" viewBox="0 0 76 76" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="1.6" aria-hidden="true">' +
    '<path d="M76 0L20 0M76 0L76 56M76 0L30 46M76 0L50 54M76 0L22 22M60 0c0 10 6 16 16 16M44 0c0 18 14 32 32 32M30 0c0 26 20 46 46 46"></path></svg>';
  var SPIDER = '<svg width="44" height="170" viewBox="0 0 44 170" aria-hidden="true"><path d="M22 0v120" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"></path>' +
    '<circle cx="22" cy="132" r="12" fill="#1A0F24"></circle><circle cx="22" cy="117" r="7" fill="#1A0F24"></circle>' +
    '<path d="M10 126l-10-8M10 132H0M10 138l-10 8M34 126l10-8M34 132h10M34 138l10 8" stroke="#1A0F24" stroke-width="2.5" stroke-linecap="round"></path></svg>';
  var PUMPKIN = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">' +
    '<path d="M20 10c1-4 4-6 7-5-2 1-4 3-5 6z" fill="#3C6E2A"></path>' +
    '<ellipse cx="13" cy="24" rx="8" ry="11" fill="#D9631A"></ellipse><ellipse cx="27" cy="24" rx="8" ry="11" fill="#D9631A"></ellipse>' +
    '<ellipse cx="20" cy="24" rx="8.5" ry="12" fill="#F2841F"></ellipse>' +
    '<path d="M13 21l4 3h-4zM27 21l-4 3h4zM13 29c4 3.5 10 3.5 14 0l-2.5 1.2-2-1.2-2.5 1.2-2.5-1.2-2 1.2z" fill="#2A1400"></path></svg>';
  var SPIDER_KNOB = '<svg width="100%" height="100%" viewBox="0 0 40 40" aria-hidden="true">' +
    '<path d="M12 16L3 9M11 20H2M12 24l-9 7M28 16l9-7M29 20h9M28 24l9 7" stroke="#1A0F24" stroke-width="2.6" stroke-linecap="round"></path>' +
    '<circle cx="20" cy="22" r="10" fill="#1A0F24"></circle><circle cx="20" cy="12" r="6" fill="#1A0F24"></circle>' +
    '<circle cx="17.6" cy="11" r="1.6" fill="#FF8A1F"></circle><circle cx="22.4" cy="11" r="1.6" fill="#FF8A1F"></circle></svg>';
  var CORNER_WEB = function (flip) {
    return '<svg width="150" height="150" viewBox="0 0 76 76" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.2" aria-hidden="true"' +
      (flip ? ' style="-webkit-transform:scaleX(-1);transform:scaleX(-1)"' : '') + '>' +
      '<path d="M76 0L20 0M76 0L76 56M76 0L30 46M76 0L50 54M76 0L22 22M60 0c0 10 6 16 16 16M44 0c0 18 14 32 32 32M30 0c0 26 20 46 46 46"></path></svg>';
  };
  var pack = {
    kind: 'theme', id: 'halloween', name: 'Halloween',
    description: 'Holiday: a moon and bats behind everything, cobwebs on tiles and in the screen corners, a spider on panels, a pumpkin on sliders, spiders on switches, an orange glow behind focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, style: 'overflow:hidden;background:linear-gradient(to bottom,rgba(40,10,60,0.35),rgba(40,10,60,0) 60%)', html: SKY },
      { target: '*', slot: 'back', when: 'focused', outset: 26, style: 'border-radius:56px;background:#FF8A1F;opacity:0.5;-webkit-filter:blur(16px);filter:blur(16px)',
        fill: '#FF8A1F', radius: 56, blur: 16, opacity: 0.5 },
      { target: 'tile', slot: 'front', when: 'always', outset: [6, 6, 0, 0], style: 'left:auto;bottom:auto;width:76px;height:76px', html: WEB },
      { target: 'panel', slot: 'front', when: 'always', outset: [0, 56, 0, 0], style: 'left:auto;bottom:auto;width:44px;height:170px', html: SPIDER },
      { target: 'settings', slot: 'front', when: 'always', outset: [0, 64, 0, 0], style: 'left:auto;bottom:auto;width:44px;height:170px', html: SPIDER },
      { target: 'chip', slot: 'back', when: 'always', outset: 6, style: 'border-radius:999px;background:#FF8A1F' },
      { target: 'chip', slot: 'front', when: 'always', outset: [16, 0, 0, 0], style: 'bottom:auto;height:16px;text-align:center',
        html: '<svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true"><path d="M6 16c0-6 1-11 6-14-1 4-2 9-2 14z" fill="#3C6E2A"></path></svg>' },
      { target: 'thumb', slot: 'front', when: 'always', outset: 10, style: '', html: PUMPKIN, asset: 'thumb.png' },
      { target: 'knob', slot: 'front', when: 'always', outset: 6, style: '', html: SPIDER_KNOB },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, style: 'left:auto;bottom:auto;width:150px;height:150px', html: CORNER_WEB(false) },
      { target: 'screen', slot: 'front', when: 'always', outset: 0, style: 'right:auto;bottom:auto;width:150px;height:150px', html: CORNER_WEB(true) }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
