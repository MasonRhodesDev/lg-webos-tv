const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TP = require('../runtime/theme-pack.js');

const dir = path.join(__dirname, '..');
const themes = fs.readdirSync(path.join(dir, 'packs/themes')).map((f) => require('../packs/themes/' + f));

test('every recipe asset exists in its theme\'s asset pack', () => {
  themes.forEach((t) => t.recipes.filter((r) => r.asset).forEach((r) => {
    assert.ok(fs.existsSync(path.join(dir, 'packs/assets', t.id, r.asset)), t.id + ' is missing assets/' + t.id + '/' + r.asset);
  }));
});

test('every recipe fill is a colour or a style token', () => {
  themes.forEach((t) => t.recipes.filter((r) => r.fill).forEach((r) => {
    assert.ok(/^(#[0-9a-f]{3,8}|rgba?\()/i.test(r.fill) || TP.TOKENS.indexOf(r.fill) >= 0, t.id + ': fill ' + r.fill);
  }));
});

test('every style ships its font files as TrueType, with the font\'s licence beside them', () => {
  fs.readdirSync(path.join(dir, 'packs/styles')).map((f) => require('../packs/styles/' + f)).forEach((s) => {
    assert.ok(s.font.files && s.font.files.length, s.id + ' lists no font files');
    s.font.files.forEach((f) => {
      assert.ok(/\.ttf$/.test(f), s.id + ': ' + f + ' is not a .ttf (the compositor\'s Qt reads no WOFF)');
      assert.ok(fs.existsSync(path.join(dir, 'packs/fonts', f)), s.id + ' is missing fonts/' + f);
      assert.ok(fs.existsSync(path.join(dir, 'packs/fonts', path.dirname(f), 'OFL.txt')), s.id + ': no OFL.txt beside ' + f);
    });
  });
});

// The QML Ring places a ring with ui/Look/place.js, read from the recipe's CSS `style`; load it as the QML engine does.
const place = (() => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'ui/Look/place.js'), 'utf8'), ctx);
  return ctx;
})();
const recipes = [].concat(...themes.map((t) => t.recipes.map((r) => Object.assign({ theme: t.id }, r))));
function outsetBox(r, w, h) {
  const o = typeof r.outset === 'number' ? [r.outset, r.outset, r.outset, r.outset] : r.outset || [0, 0, 0, 0];
  const b = place.rect(place.placement(r.style), w + o[1] + o[3], h + o[0] + o[2]);
  return { x: b.x - o[3], y: b.y - o[0], width: b.width, height: b.height };
}

test('every placement in a recipe style is one the QML Ring reads', () => {
  recipes.forEach((r) => (r.style || '').split(';').forEach((d) => {
    const m = /^\s*(left|right|top|bottom|width|height)\s*:\s*(.*?)\s*$/.exec(d);
    if (!m) return;
    if (m[1] === 'width' || m[1] === 'height') assert.ok(/^\d+(\.\d+)?px$/.test(m[2]), r.theme + ' ' + r.target + ': ' + d.trim() + ' (only px sizes)');
    else assert.strictEqual(m[2], 'auto', r.theme + ' ' + r.target + ': ' + d.trim() + ' (edges come from the outset; only auto)');
  }));
  recipes.forEach((r) => {
    const p = place.placement(r.style);
    if (p.left || p.right) assert.ok(p.width >= 0, r.theme + ' ' + r.target + ': an auto left/right edge needs a px width');
    if (p.top || p.bottom) assert.ok(p.height >= 0, r.theme + ' ' + r.target + ': an auto top/bottom edge needs a px height');
  });
});

test('a sized ring\'s style agrees with the size of the svg it holds', () => {
  recipes.filter((r) => /^<svg[^>]*>[\s\S]*<\/svg>$/.test(r.html || '') && (r.html.match(/<svg/g) || []).length === 1).forEach((r) => {
    const p = place.placement(r.style), w = /^<svg[^>]*\swidth="(\d+)"/.exec(r.html), h = /^<svg[^>]*\sheight="(\d+)"/.exec(r.html);
    if (p.width >= 0 && w) assert.strictEqual(p.width, Number(w[1]), r.theme + ' ' + r.target + ': style width vs svg width');
    if (p.height >= 0 && h) assert.strictEqual(p.height, Number(h[1]), r.theme + ' ' + r.target + ': style height vs svg height');
  });
});

test('the QML Ring puts corner decorations where the CSS does', () => {
  const find = (theme, target, s) => recipes.find((r) => r.theme === theme && r.target === target && (r.style || '').indexOf(s) >= 0);
  // A 300×210 tile: the cobweb straddles its top-right corner, 20 px out.
  assert.deepStrictEqual(outsetBox(find('halloween', 'tile', 'width:44px'), 300, 210), { x: 276, y: -20, width: 44, height: 44 });
  // A 600×800 panel: the spider hangs from the top, 8 px out past the right edge.
  assert.deepStrictEqual(outsetBox(find('halloween', 'panel', 'height:170px'), 600, 800), { x: 608, y: 0, width: 44, height: 170 });
  // The graveyard and the snowbank fill the bottom overscan strip under a 1728-wide ribbon, edge to edge.
  assert.deepStrictEqual(outsetBox(find('halloween', 'ribbon', 'height:54px'), 1728, 400), { x: -96, y: 400, width: 1920, height: 54 });
  assert.deepStrictEqual(outsetBox(find('winter', 'ribbon', 'height:54px'), 1728, 400), { x: -96, y: 400, width: 1920, height: 54 });
  // Winter's focus flake: top-left, 20 px out.
  assert.deepStrictEqual(outsetBox(find('winter', '*', 'width:36px'), 300, 210), { x: -20, y: -20, width: 36, height: 36 });
  // Icicles: the screen's top 44 px, full width.
  assert.deepStrictEqual(outsetBox(find('winter', 'screen', 'height:44px'), 1920, 1080), { x: 0, y: 0, width: 1920, height: 44 });
  // Halloween's screen cobwebs: one per top corner.
  assert.deepStrictEqual(outsetBox(find('halloween', 'screen', 'left:auto'), 1920, 1080), { x: 1770, y: 0, width: 150, height: 150 });
  assert.deepStrictEqual(outsetBox(find('halloween', 'screen', 'right:auto'), 1920, 1080), { x: 0, y: 0, width: 150, height: 150 });
  // No size in the style: the ring fills its outset box, as before.
  assert.deepStrictEqual(outsetBox(find('halloween', 'thumb', ''), 40, 40), { x: -10, y: -10, width: 60, height: 60 });
});

// Recipes the QML layer may leave to the HTML renderer, each with why. Empty: every theme draws whole in both.
const HTML_ONLY = {};

test('every recipe is drawable by the QML layer: it names an asset, a fill or a stroke', () => {
  recipes.forEach((r) => {
    const where = r.theme + ' ' + r.target + '/' + r.slot + ' ' + r.when;
    if (HTML_ONLY[where]) assert.ok(!r.asset && !r.fill && !r.stroke, where + ' is listed as HTML-only but is drawable');
    else assert.ok(r.asset || r.fill || r.stroke, where + ' has nothing the QML layer draws (no asset, fill or stroke)');
  });
});

test('every recipe declares its cost, and the cost is what it draws', () => {
  recipes.forEach((r) => {
    const where = r.theme + ' ' + r.target + '/' + r.slot + ' ' + r.when;
    assert.ok(['static', 'glow'].indexOf(r.cost) >= 0, where + ': cost ' + r.cost + ' (static or glow; nothing animates yet)');
    assert.strictEqual(r.cost, r.fill && r.blur ? 'glow' : 'static', where + ': a blurred fill costs glow, everything else static');
  });
});

test('every stroke is a colour or a style token, with a px width', () => {
  recipes.filter((r) => r.stroke).forEach((r) => {
    assert.ok(/^(#[0-9a-f]{3,8}|rgba?\()/i.test(r.stroke) || TP.TOKENS.indexOf(r.stroke) >= 0, r.theme + ': stroke ' + r.stroke);
    assert.ok(r.strokeWidth > 0, r.theme + ' ' + r.target + ': stroke needs a strokeWidth');
  });
});

test('every recipe radius is px or a radius token', () => {
  recipes.filter((r) => r.radius !== undefined).forEach((r) => {
    assert.ok(typeof r.radius === 'number' || (/^r-/.test(r.radius) && TP.TOKENS.indexOf(r.radius) >= 0), r.theme + ' ' + r.target + ': radius ' + r.radius);
  });
});

test('recipes write only to the decoration targets DESIGN.md lists', () => {
  const md = fs.readFileSync(path.join(dir, 'DESIGN.md'), 'utf8');
  const contract = md.slice(md.indexOf('## Decoration contract'));
  const targets = [...contract.matchAll(/^\| `([a-z]+)` \|/gm)].map((m) => m[1]);
  assert.ok(targets.length >= 14, 'found the contract table');
  recipes.forEach((r) => assert.ok(r.target === '*' || targets.indexOf(r.target) >= 0, r.theme + ': unknown target ' + r.target));
});

function pngSize(file) {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('every recipe with html names an asset', () => {
  recipes.filter((r) => r.html).forEach((r) => {
    assert.ok(r.asset, r.theme + ' ' + r.target + '/' + r.slot + ' has html but no asset; run render-assets.mjs and name one');
  });
});

test('assets are rendered at their svg\'s aspect, at 2× its CSS size (screen-wide at 1×)', () => {
  recipes.filter((r) => r.asset).forEach((r) => {
    const where = r.theme + '/' + r.asset, got = pngSize(path.join(dir, 'packs/assets', r.theme, r.asset));
    const svgs = r.html.match(/<svg\b[^>]*>/g);
    let want;
    if (svgs.length > 1) {
      // A field of placed svgs: the ring's box, the screen for a screen target.
      want = [1920, 1080];
    } else {
      const w = /\swidth="(\d+)"/.exec(svgs[0]), h = /\sheight="(\d+)"/.exec(svgs[0]);
      if (w && h) {
        const k = Number(w[1]) >= 1920 ? 1 : 2;
        want = [Number(w[1]) * k, Number(h[1]) * k];
      } else {
        // width="100%": the viewBox's aspect, 128 px on the longer side.
        const vb = /viewBox="([^"]*)"/.exec(svgs[0])[1].split(/\s+/).map(Number), k = 128 / Math.max(vb[2], vb[3]);
        want = [Math.round(vb[2] * k), Math.round(vb[3] * k)];
      }
    }
    assert.deepStrictEqual(got, want, where);
  });
});

test('recipes naming the same asset draw the same thing', () => {
  const seen = {};
  recipes.filter((r) => r.asset).forEach((r) => {
    const key = r.theme + '/' + r.asset, src = r.html + '|' + r.style;
    if (seen[key] === undefined) seen[key] = src;
    assert.strictEqual(seen[key], src, key);
  });
});
