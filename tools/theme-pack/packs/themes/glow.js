(function (root) {
  var pack = {
    kind: 'theme', id: 'glow', name: 'Glow',
    description: 'A soft bloom behind focus and an accent ring around it. Uses the style\'s focus colour.',
    reads: ['focus'],
    recipes: [
      { target: '*', slot: 'back', when: 'focused', outset: 30, style: 'border-radius:60px;background:var(--tp-focus);opacity:0.45;-webkit-filter:blur(14px);filter:blur(14px)',
        fill: 'focus', radius: 60, blur: 14, opacity: 0.45 },
      { target: '*', slot: 'front', when: 'focused', outset: 14, style: 'border-radius:40px;box-shadow:0 0 0 4px var(--tp-focus)' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
