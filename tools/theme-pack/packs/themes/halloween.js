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
  var pack = {
    kind: 'theme', id: 'halloween', name: 'Halloween',
    description: 'Holiday: a moon and bats behind everything, cobwebs on tiles, a spider on panels, an orange glow behind focus.',
    reads: [],
    recipes: [
      { target: 'screen', slot: 'back', when: 'always', outset: 0, style: 'overflow:hidden;background:linear-gradient(to bottom,rgba(40,10,60,0.35),rgba(40,10,60,0) 60%)', html: SKY },
      { target: '*', slot: 'back', when: 'focused', outset: 26, style: 'border-radius:56px;background:#FF8A1F;opacity:0.5;-webkit-filter:blur(16px);filter:blur(16px)' },
      { target: 'tile', slot: 'front', when: 'always', outset: [6, 6, 0, 0], style: 'left:auto;bottom:auto;width:76px;height:76px', html: WEB },
      { target: 'panel', slot: 'front', when: 'always', outset: [0, 56, 0, 0], style: 'left:auto;bottom:auto;width:44px;height:170px', html: SPIDER },
      { target: 'settings', slot: 'front', when: 'always', outset: [0, 64, 0, 0], style: 'left:auto;bottom:auto;width:44px;height:170px', html: SPIDER },
      { target: 'chip', slot: 'back', when: 'always', outset: 6, style: 'border-radius:999px;background:#FF8A1F' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
