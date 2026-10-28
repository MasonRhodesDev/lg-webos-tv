(function (root) {
  // Light, in the style's own colours: a bloom and a crisp halo ring around focus, soft light pooling behind
  // surfaces, attachments shining in their attention colour, chosen controls lit in the current colour. No art, so it
  // suits any style and any season. Nothing over the picture's edges, and nothing lights what is disabled.
  function glow(token, outset, radius, blur, opacity) {
    return { outset: outset, cost: 'glow', fill: token, radius: radius, blur: blur, opacity: opacity,
      style: 'border-radius:' + radius + 'px;background:var(--tp-' + token + ');opacity:' + opacity + ';-webkit-filter:blur(' + blur + 'px);filter:blur(' + blur + 'px)' };
  }
  function recipe(target, slot, when, r, place) {
    r.target = target;
    r.slot = slot;
    r.when = when;
    if (place) r.style = place + ';' + r.style;
    return r;
  }
  // A crisp halo around focus, 14 px out, concentric with the component's own corners.
  function ring(target, radius) {
    return { target: target, slot: 'front', when: 'focused', outset: 14, cost: 'static', stroke: 'focus', strokeWidth: 4, radius: radius,
      style: 'border-radius:calc(var(--tp-' + radius + ') + 14px);box-shadow:inset 0 0 0 4px var(--tp-focus)' };
  }
  var pack = {
    kind: 'theme', id: 'glow', name: 'Glow',
    description: 'A soft bloom behind focus and an accent ring around it, light behind panels, toasts and dialogs, and glowing chips and chosen controls. Uses the style\'s own colours.',
    reads: ['focus', 'attention', 'current', 'ink', 'r-row', 'r-tile', 'r-control'],
    recipes: [
      // Light pools in two corners of the screen, behind everything.
      recipe('screen', 'back', 'always', glow('focus', 0, 320, 160, 0.16), 'left:auto;bottom:auto;width:820px;height:520px'),
      recipe('screen', 'back', 'always', glow('focus', 0, 320, 160, 0.12), 'right:auto;top:auto;width:820px;height:520px'),
      recipe('panel', 'back', 'always', glow('focus', 22, 56, 26, 0.22)),
      recipe('toast', 'back', 'always', glow('focus', 18, 48, 20, 0.22)),
      recipe('dialog', 'back', 'always', glow('focus', 28, 72, 34, 0.25)),
      // A floor of light under the ribbon's tiles and key hints.
      recipe('ribbon', 'back', 'always', glow('focus', [0, 0, 40, 0], 60, 40, 0.18), 'top:auto;height:160px'),
      recipe('*', 'back', 'focused', glow('focus', 30, 60, 14, 0.45)),
      ring('row', 'r-row'),
      ring('tile', 'r-tile'),
      ring('button', 'r-control'),
      recipe('chip', 'back', 'always', glow('attention', 10, 999, 10, 0.6)),
      recipe('badge', 'back', 'always', glow('ink', 8, 999, 8, 0.3)),
      recipe('thumb', 'back', 'always', glow('ink', 10, 999, 8, 0.4)),
      recipe('knob', 'back', 'always', glow('ink', 8, 999, 8, 0.35)),
      recipe('radio', 'back', 'current', glow('current', 10, 999, 8, 0.55)),
      recipe('check', 'back', 'current', glow('current', 10, 18, 8, 0.55))
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = pack;
  else root.ThemePack.register(pack);
})(this);
