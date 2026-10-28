/* theme-pack runtime: styles, themes, the layer model, and the components.
   Renders to HTML strings so the same code serves the browser, node tests and the canvas exporter.
   Written for Chromium 53: no flex gap, no inset shorthand, no object spread, no ?. or ??. */
(function (root) {
  'use strict';

  var TOKENS = [
    'surface', 'surface-edge', 'inner', 'dim', 'scrim',
    'ink', 'ink-2', 'ink-3', 'ink-disabled', 'edge-disabled', 'shadow',
    'focus', 'focus-ink', 'focus-edge', 'current',
    'attention', 'attention-ink', 'critical', 'critical-ink',
    'track', 'knob',
    'hue-0', 'hue-1', 'hue-2', 'hue-3', 'hue-4', 'hue-5', 'hue-6',
    'r-tile', 'r-panel', 'r-row', 'r-key',
    // The design language (DESIGN.md): colour roles, sizes, type, elevation and motion the component kit reads.
    'surface-strong', 'divider', 'current-ink', 'r-control',
    'safe-x', 'safe-y', 'space-xs', 'space-s', 'space-m', 'space-ml', 'space-l', 'space-lx', 'space-xl', 'space-xxl',
    'edge-w', 'focus-w', 'focus-scale', 'current-w',
    'panel-w', 'dialog-w', 'toast-w', 'row-h', 'row-h-2', 'row-pad', 'section-h', 'icon', 'icon-l', 'well', 'volume-w', 'volume-h',
    'track-h', 'thumb', 'toggle-w', 'toggle-h', 'knob-size', 'button-h', 'tile-w', 'tile-h', 'tile-pad',
    'elev-panel', 'elev-focus',
    'type-display', 'type-display-weight', 'type-title', 'type-title-weight', 'type-tile', 'type-tile-weight',
    'type-label', 'type-label-weight', 'type-category', 'type-category-weight', 'type-value', 'type-value-weight', 'type-body', 'type-body-weight',
    'type-caption', 'type-caption-weight', 'type-headline', 'type-headline-weight', 'type-heading', 'type-heading-weight', 'type-heading-case',
    'type-key', 'type-key-weight', 'type-numeral', 'type-numeral-weight',
    'motion-focus', 'motion-value', 'motion-enter', 'motion-exit', 'ease-focus', 'ease-enter', 'ease-exit', 'enter-shift'
  ];

  var registry = { style: {}, theme: {} };

  function register(pack) {
    if (!pack || (pack.kind !== 'style' && pack.kind !== 'theme')) throw new Error('pack needs kind "style" or "theme"');
    registry[pack.kind][pack.id] = pack;
    return pack;
  }
  function list(kind) {
    return Object.keys(registry[kind]).map(function (id) { return registry[kind][id]; });
  }
  function get(kind, id) { return registry[kind][id]; }

  function missingTokens(style) {
    return TOKENS.filter(function (t) { return style.tokens[t] == null; });
  }

  function styleVars(style) {
    return TOKENS.map(function (t) { return '--tp-' + t + ':' + style.tokens[t]; }).join(';');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function assign() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i];
      if (o) for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    }
    return out;
  }

  function el(type, props, children) {
    return { type: type, props: props || {}, children: children || [] };
  }

  var ICONS = {
    port: 'M3 8h18v5l-3 3H6l-3-3z',
    flask: 'M9 3h6M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3M7.5 14h9',
    usb: 'M6 2h12v9H6zM9 11v4h6v-4M12 15v7',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
    screen: 'M3 5h18v12H3zM8 21h8M12 17v4',
    speaker: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    leaf: 'M5 21c0-9 6-15 16-16-1 10-7 16-16 16zM5 21l8-8',
    power: 'M12 2v10M5.6 6.6a9 9 0 1 0 12.8 0',
    palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.4-.8-2.3 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.7-9-8.7zM7.5 11h.01M10 7.5h.01M14 7.5h.01',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z',
    usbWarn: 'M6 2h12v9H6zM9 11v4h6v-4M12 15v7',
    wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 19.5h.01',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01',
    person: 'M12 3.5h.01M5 8l7 1.5L19 8M12 9.5V14l-3 6M12 14l3 6',
    drill: 'M9 6l6 6-6 6',
    check: 'M5 12l5 5 9-10'
  };

  function icon(name, color, size) {
    var s = size || 34;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (ICONS[name] || name) + '"></path></svg>';
  }

  // ---- layer model ----------------------------------------------------------

  // An outset is a number, [top, right, bottom, left], or per state ({ rest, focused, current, disabled }), as in
  // the QML Ring (ui/Look/place.js outset()).
  function outsetCss(o, state) {
    if (o && typeof o === 'object' && o.length === undefined) {
      o = state.focused && o.focused !== undefined ? o.focused : state.current && o.current !== undefined ? o.current
        : state.disabled && o.disabled !== undefined ? o.disabled : o.rest;
    }
    var v = typeof o === 'number' ? [o, o, o, o] : (o || [0, 0, 0, 0]);
    return 'top:' + (-v[0]) + 'px;right:' + (-v[1]) + 'px;bottom:' + (-v[2]) + 'px;left:' + (-v[3]) + 'px';
  }

  function stateOf(props) {
    return { focused: !!props.focused, current: !!props.current, disabled: !!props.disabled };
  }

  function matches(recipe, type, state) {
    if (recipe.target !== '*' && recipe.target !== type) return false;
    var w = recipe.when || 'always';
    return w === 'always' || !!state[w];
  }

  // The decoration target (DESIGN.md, Decoration contract) of components the demo draws under its own names.
  var TARGET = { settings: 'panel', volume: 'panel' };

  function rings(type, state, slot, ctx) {
    if (!ctx.decor) return '';
    type = TARGET[type] || type;
    var themes = slot === 'back' ? ctx.themes.slice().reverse() : ctx.themes;
    var out = '';
    themes.forEach(function (theme) {
      theme.recipes.forEach(function (r) {
        if (r.slot !== slot || !matches(r, type, state)) return;
        out += '<div data-tp-ring="' + esc(theme.id) + '" style="position:absolute;' + outsetCss(r.outset, state) + ';' + (r.style || '') + '">' + (r.html || '') + '</div>';
      });
    });
    return out;
  }

  var FILL = 'position:absolute;top:0;right:0;bottom:0;left:0;pointer-events:none';

  function layered(type, props, originStyle, originHtml, ctx, opts) {
    var state = stateOf(props);
    var lift = props.focused && ctx.lift ? 10 : 0;
    // Decoration on a disabled component recedes with it.
    var dim = props.disabled ? ';opacity:0.5' : '';
    var place = props.place || '';
    var container = opts && opts.container;
    var attach = (props.attach || []).map(function (a) { return renderAttachment(a, ctx); }).join('');
    return '<div data-tp="' + type + '"' + (props.focused ? ' data-tp-focused="1"' : '') + ' style="position:relative;' + place + '">' +
      '<div data-tp-slot="back" style="' + FILL + ';z-index:' + (1 + lift) + dim + '">' + rings(type, state, 'back', ctx) + '</div>' +
      '<div data-tp-slot="origin" style="position:relative;z-index:' + (2 + lift) + ';' + (container ? 'isolation:isolate;' : '') + originStyle + '">' + originHtml + '</div>' +
      '<div data-tp-slot="front" style="' + FILL + ';z-index:' + (3 + lift) + dim + '">' + rings(type, state, 'front', ctx) + '</div>' +
      '<div data-tp-slot="attach" style="' + FILL + ';z-index:' + (4 + lift) + '">' + attach + '</div>' +
      '</div>';
  }

  function renderAttachment(a, ctx) {
    var anchor = a.anchor || [100, 0];
    var p = assign(a.props, { place: 'position:absolute;left:' + anchor[0] + '%;top:' + anchor[1] + '%;' +
      '-webkit-transform:translate(-50%,-50%);transform:translate(-50%,-50%);pointer-events:auto' });
    return render(el(a.type, p, a.children), ctx);
  }

  // ---- shared pieces --------------------------------------------------------

  function shadow(ctx) { return ctx.style.behaviour.textShadow ? 'text-shadow:var(--tp-shadow);' : ''; }
  var EDGE = 'box-shadow:inset 0 0 0 1.5px var(--tp-surface-edge);';

  function hueVar(i) { return 'var(--tp-hue-' + ((i || 0) % 7) + ')'; }

  function focusColors(props, ctx) {
    var fill = ctx.style.behaviour.focusFill === 'hue' ? hueVar(props.hue) : 'var(--tp-focus)';
    return { bg: fill, ink: 'var(--tp-focus-ink)', edge: 'inset 0 0 0 4px var(--tp-focus-edge)' };
  }

  function stack(children, ctx, dir, gap) {
    return children.map(function (c, i) {
      if (i > 0 && c && c.props) {
        c = el(c.type, assign(c.props, { place: (c.props.place || '') + (dir === 'row' ? 'margin-left:' : 'margin-top:') + gap + 'px;' }), c.children);
      }
      return render(c, ctx);
    }).join('');
  }

  function keyHints(hints, ctx) {
    return (hints || []).map(function (h, i) {
      return '<span style="display:-webkit-box;display:flex;align-items:center;' + (i ? 'margin-left:36px;' : '') + '">' +
        '<span style="padding:3px 12px;border-radius:999px;background:var(--tp-surface);' + EDGE + 'font-size:18px;margin-right:10px">' + esc(h.key) + '</span>' + esc(h.label) + '</span>';
    }).join('');
  }

  // ---- components -----------------------------------------------------------

  var C = {};

  function track(pct, fill, width, ctx) {
    return '<span style="position:relative;display:block;' + (width ? 'width:' + width + 'px;' : '-webkit-box-flex:1;flex:1;') + 'height:12px;border-radius:999px;background:var(--tp-track)">' +
      '<span style="position:absolute;left:0;top:0;bottom:0;width:' + pct + '%;border-radius:999px;background:' + fill + '"></span>' +
      render(el('thumb', { place: 'position:absolute;left:' + pct + '%;top:50%;margin-left:-15px;margin-top:-15px;' }), ctx) + '</span>';
  }

  // The thumb and knob are their own components so themes can dress them; their origin always shows the value.
  C.thumb = function (p, kids, ctx) {
    return layered('thumb', p, 'width:30px;height:30px;border-radius:999px;background:var(--tp-ink);box-shadow:0 2px 8px rgba(0,0,0,0.45)', '', ctx);
  };

  C.knob = function (p, kids, ctx) {
    return layered('knob', p, 'width:32px;height:32px;border-radius:999px;background:' + (p.on ? 'var(--tp-knob)' : '#FFFFFF'), '', ctx);
  };

  C.screen = function (p, kids, ctx) {
    var pic = p.picture
      ? '<img src="' + esc(p.picture) + '" alt="" style="position:absolute;left:0;top:0;width:1920px;height:1080px;object-fit:cover">'
      : (p.transparent ? '' : '<div style="position:absolute;left:0;top:0;width:1920px;height:1080px;background:linear-gradient(160deg,#3b5b4a 0%,#6b8f5e 45%,#c9b27a 100%)"></div>');
    var credit = p.credit ? '<span style="position:absolute;left:24px;top:16px;font-size:14px;color:rgba(255,255,255,0.75);text-shadow:0 1px 3px rgba(0,0,0,0.8)">' + esc(p.credit) + '</span>' : '';
    // The picture stands in for the HDMI hardware plane, so it sits under every layer of the screen.
    var ui = layered('screen', p, 'width:1920px;height:1080px', kids.map(function (k) { return render(k, ctx); }).join(''), ctx, { container: true });
    return '<div data-tp-root="1" style="position:relative;width:1920px;height:1080px;overflow:hidden;font-family:' + ctx.style.font.stack + ';color:var(--tp-ink);' + styleVars(ctx.style) + '">' +
      pic + '<div style="position:absolute;left:0;top:0">' + ui + '</div>' + credit + '</div>';
  };

  C.tile = function (p, kids, ctx) {
    var f = p.focused, fc = focusColors(p, ctx);
    var ink = p.disabled ? 'var(--tp-ink-disabled)' : f ? fc.ink : 'var(--tp-ink)';
    var edges = [f ? fc.edge : 'inset 0 0 0 1.5px var(--tp-surface-edge)'];
    if (p.current) edges.push('inset 0 -7px 0 var(--tp-current)');
    var tag = p.tag ? render(el('badge', { text: p.tag }), ctx) : '';
    var html = '<span style="display:-webkit-box;display:flex;justify-content:space-between;align-items:flex-start">' +
      icon(p.icon || 'port', p.disabled ? 'var(--tp-ink-disabled)' : f ? fc.ink : hueVar(p.hue), 42) + tag + '</span>' +
      '<span style="display:block"><span style="display:block;font-size:32px;font-weight:700;line-height:1.1">' + esc(p.label) + '</span>' +
      '<span style="display:block;font-size:21px;font-weight:500;opacity:0.9">' + esc(p.sub) + '</span></span>';
    return layered('tile', p,
      'box-sizing:border-box;width:' + (p.width || 230) + 'px;height:' + (p.height || 190) + 'px;padding:24px;border-radius:var(--tp-r-tile);' +
      'display:-webkit-box;display:flex;flex-direction:column;justify-content:space-between;' +
      'background:' + (f ? fc.bg : 'var(--tp-surface)') + ';color:' + ink + ';box-shadow:' + edges.join(',') + ';' +
      (p.disabled ? 'border:2px dashed rgba(255,255,255,0.35);' : '') + (f ? '' : shadow(ctx)),
      html, ctx);
  };

  C.chip = function (p, kids, ctx) {
    var tone = p.tone === 'critical' ? 'critical' : 'attention';
    return layered('chip', p, 'min-width:50px;height:50px;box-sizing:border-box;padding:0 12px;border-radius:999px;' +
      'background:var(--tp-' + tone + ');color:var(--tp-' + tone + '-ink);font-size:26px;font-weight:700;' +
      'display:-webkit-box;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(0,0,0,0.35)', esc(p.text), ctx);
  };

  C.badge = function (p, kids, ctx) {
    return layered('badge', p, 'padding:5px 14px;border-radius:999px;background:var(--tp-ink);color:var(--tp-focus-ink);font-size:19px;font-weight:700;text-shadow:none', esc(p.text), ctx);
  };

  C.row = function (p, kids, ctx) {
    var f = p.focused, fc = focusColors(p, ctx);
    var ink = f ? fc.ink : p.disabled ? 'var(--tp-ink-disabled)' : 'var(--tp-ink)';
    var edges = [];
    if (f) edges.push(fc.edge);
    if (p.current && !f) edges.push('inset 0 -7px 0 var(--tp-current)');
    var control = '';
    if (p.value != null) control += '<span style="font-size:24px;font-weight:500;opacity:0.9;margin-left:16px">' + esc(p.value) + '</span>';
    if (p.control === 'toggle') {
      control += '<span style="width:72px;height:40px;box-sizing:border-box;padding:4px;margin-left:16px;border-radius:999px;background:' + (p.on ? 'var(--tp-current)' : 'var(--tp-track)') +
        ';display:-webkit-box;display:flex;justify-content:' + (p.on ? 'flex-end' : 'flex-start') + '">' + render(el('knob', { on: p.on }), ctx) + '</span>';
    }
    if (p.control === 'slider') {
      control += '<span style="margin-left:16px">' + track(p.pct, f ? fc.ink : 'var(--tp-ink)', 280, ctx) + '</span>' +
        '<span style="width:52px;text-align:right;font-size:26px;font-weight:700">' + esc(p.pct) + '</span>';
    }
    if (p.control === 'check' && p.current) control += '<span style="margin-left:16px">' + icon('check', f ? fc.ink : 'var(--tp-current)', 32) + '</span>';
    if (p.control === 'drill') control += '<span style="margin-left:12px">' + icon('drill', ink, 28) + '</span>';
    var html = icon(p.icon || 'screen', f ? fc.ink : p.disabled ? 'var(--tp-ink-disabled)' : hueVar(p.hue)) +
      '<span style="display:block;-webkit-box-flex:1;flex:1;min-width:0;margin-left:20px"><span style="display:block;font-size:26px;font-weight:600">' + esc(p.label) + '</span>' +
      (p.hint ? '<span style="display:block;font-size:20px;font-weight:500;opacity:0.8">' + esc(p.hint) + '</span>' : '') + '</span>' + control;
    return layered('row', p,
      'box-sizing:border-box;height:' + (p.hint ? 96 : 88) + 'px;padding:0 28px;border-radius:var(--tp-r-row);display:-webkit-box;display:flex;align-items:center;' +
      'background:' + (f ? fc.bg : 'var(--tp-inner)') + ';color:' + ink + ';box-shadow:' + (edges.join(',') || 'none') + ';' +
      (p.disabled ? 'outline:2px dashed rgba(255,255,255,0.35);outline-offset:-2px;' : '') + (f ? '' : shadow(ctx)),
      html, ctx, { container: true });
  };

  C.panel = function (p, kids, ctx) {
    var head = (p.crumb ? '<span style="display:block;font-size:22px;font-weight:600;color:var(--tp-ink-3)">' + esc(p.crumb) + ' ›</span>' : '') +
      '<span style="display:-webkit-box;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:24px">' +
      '<span style="font-size:40px;font-weight:700">' + esc(p.title) + '</span><span style="font-size:20px;font-weight:500;color:var(--tp-ink-3)">' + esc(p.sub) + '</span></span>';
    var hints = p.hints ? '<div style="display:-webkit-box;display:flex;margin-top:28px;font-size:22px;font-weight:600">' + keyHints(p.hints, ctx) + '</div>' : '';
    return layered('panel', p,
      'box-sizing:border-box;width:' + (p.width || 640) + 'px;' + (p.height ? 'height:' + p.height + 'px;' : '') + 'padding:36px 32px;border-radius:var(--tp-r-panel);' +
      'background:var(--tp-surface);' + EDGE + shadow(ctx),
      head + stack(kids, ctx, 'col', 12) + hints, ctx, { container: true });
  };

  C.dock = function (p, kids, ctx) {
    var html = '<div style="position:absolute;left:0;right:0;bottom:0;height:520px;background:linear-gradient(to bottom,rgba(0,0,0,0) 0,var(--tp-scrim) 160px)"></div>' +
      '<div style="position:absolute;left:96px;right:96px;bottom:54px">' + layered('ribbon', {}, '',
      '<div style="display:-webkit-box;display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;' + shadow(ctx) + '">' +
      '<span style="font-size:30px;font-weight:700">' + esc(p.title) + '</span>' +
      '<span style="display:-webkit-box;display:flex;align-items:center"><span style="padding:8px 20px;border-radius:999px;background:var(--tp-surface);' + EDGE + 'font-size:22px;font-weight:600;margin-right:16px">' + esc(p.status) + '</span>' +
      '<span style="font-size:40px;font-weight:700">' + esc(p.clock) + '</span></span></div>' +
      '<div style="display:-webkit-box;display:flex;align-items:flex-end;margin-bottom:30px">' + stack(kids, ctx, 'row', 24) + '</div>' +
      '<div style="display:-webkit-box;display:flex;font-size:22px;font-weight:600;' + shadow(ctx) + '">' + keyHints(p.hints, ctx) + '</div>', ctx, { container: true }) + '</div>';
    return layered('dock', p, 'position:absolute;left:0;top:0;width:1920px;height:1080px', html, ctx, { container: true });
  };

  C.volume = function (p, kids, ctx) {
    var html = icon('speaker', 'var(--tp-ink)') +
      '<span style="display:block;-webkit-box-flex:1;flex:1;margin:0 24px">' + track(p.value, 'var(--tp-ink)', 0, ctx) + '</span>' +
      '<span style="font-size:34px;font-weight:700">' + esc(p.value) + '</span>';
    return layered('volume', p, 'box-sizing:border-box;width:460px;height:80px;padding:0 28px;border-radius:999px;background:var(--tp-surface);' + EDGE +
      'display:-webkit-box;display:flex;align-items:center;' + shadow(ctx), html, ctx, { container: true });
  };

  C.button = function (p, kids, ctx) {
    var f = p.focused, fc = focusColors(p, ctx);
    return layered('button', p, 'box-sizing:border-box;height:80px;padding:0 40px;border-radius:999px;display:-webkit-box;display:flex;align-items:center;font-size:28px;font-weight:700;' +
      'background:' + (f ? fc.bg : 'var(--tp-inner)') + ';color:' + (f ? fc.ink : 'var(--tp-ink)') + ';box-shadow:' + (f ? fc.edge : 'inset 0 0 0 1.5px var(--tp-surface-edge)') + ';' + (f ? '' : shadow(ctx)),
      esc(p.label), ctx);
  };

  C.dialog = function (p, kids, ctx) {
    var html = '<div style="display:-webkit-box;display:flex;align-items:center;margin-bottom:28px"><span style="width:72px;height:72px;border-radius:999px;display:-webkit-box;display:flex;align-items:center;justify-content:center;background:var(--tp-inner);margin-right:24px">' +
      icon(p.icon || 'usb', hueVar(p.hue), 38) + '</span><span style="font-size:44px;font-weight:700">' + esc(p.title) + '</span></div>' +
      '<p style="margin:0 0 40px;font-size:28px;font-weight:500;line-height:1.45;color:var(--tp-ink-2)">' + esc(p.body) + '</p>' +
      '<div style="display:-webkit-box;display:flex;justify-content:flex-end">' + stack(kids, ctx, 'row', 24) + '</div>';
    return layered('dialog', p, 'box-sizing:border-box;width:800px;padding:56px;border-radius:var(--tp-r-panel);background:var(--tp-surface);' + EDGE + shadow(ctx), html, ctx, { container: true });
  };

  C.dim = function (p) {
    return '<div data-tp="dim" style="position:absolute;left:0;top:0;width:1920px;height:1080px;background:var(--tp-dim)"></div>';
  };

  C.settings = function (p, kids, ctx) {
    var cats = (p.cats || []).map(function (c, i) {
      var cur = c.id === p.cat, f = cur && p.catFocused, fc = focusColors({ hue: i }, ctx);
      return '<div style="box-sizing:border-box;height:84px;padding:0 24px;' + (i ? 'margin-top:10px;' : '') + 'border-radius:var(--tp-r-row);display:-webkit-box;display:flex;align-items:center;' +
        'background:' + (f ? fc.bg : cur ? 'var(--tp-inner)' : 'transparent') + ';color:' + (f ? fc.ink : 'var(--tp-ink)') + ';' +
        'box-shadow:' + (f ? fc.edge : cur ? 'inset 0 -7px 0 var(--tp-current)' : 'none') + ';' + (f ? '' : shadow(ctx)) + '">' +
        icon(c.icon, f ? fc.ink : hueVar(i)) + '<span style="margin-left:20px;font-size:28px;font-weight:600">' + esc(c.label) + '</span></div>';
    }).join('');
    var left = '<div style="width:440px;-webkit-box-flex:0;flex:none;display:-webkit-box;display:flex;flex-direction:column">' +
      '<h1 style="margin:0 0 24px 8px;font-size:64px;font-weight:700;line-height:1">Settings</h1>' + cats +
      '<span style="margin-top:auto;padding:0 8px;font-size:20px;font-weight:500;color:var(--tp-ink-3)">' + esc(p.footer) + '</span></div>';
    var right = '<div style="-webkit-box-flex:1;flex:1;min-width:0;margin-left:40px;padding-left:40px;border-left:2px solid var(--tp-inner)">' +
      (p.crumb ? '<span style="display:block;font-size:22px;font-weight:600;color:var(--tp-ink-3)">' + esc(p.crumb) + ' ›</span>' : '') +
      '<div style="display:-webkit-box;display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 24px">' +
      '<span style="font-size:40px;font-weight:700">' + esc(p.title) + '</span><span style="font-size:20px;font-weight:500;color:var(--tp-ink-3)">' + esc(p.sub) + '</span></div>' +
      stack(kids, ctx, 'col', 12) + '</div>';
    return layered('settings', p, 'box-sizing:border-box;width:1728px;height:972px;padding:40px;border-radius:var(--tp-r-panel);background:var(--tp-surface);' + EDGE +
      'display:-webkit-box;display:flex;' + shadow(ctx), left + right, ctx, { container: true });
  };

  // ---- render ---------------------------------------------------------------

  function render(node, ctx) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    var fn = C[node.type];
    if (!fn) throw new Error('unknown component "' + node.type + '"');
    return fn(node.props, node.children || [], ctx);
  }

  function context(opts) {
    var style = typeof opts.style === 'string' ? get('style', opts.style) : opts.style;
    if (!style) throw new Error('unknown style "' + opts.style + '"');
    var themes = (opts.themes || []).map(function (t) {
      var th = typeof t === 'string' ? get('theme', t) : t;
      if (!th) throw new Error('unknown theme "' + t + '"');
      return th;
    });
    return { style: style, themes: themes, decor: opts.decor !== false, lift: opts.lift !== false };
  }

  function renderScreen(tree, opts) { return render(tree, context(opts)); }

  function resolveVars(html, style) {
    return html.replace(/var\(--tp-([a-z0-9-]+)\)/g, function (m, name) {
      return style.tokens[name] != null ? style.tokens[name] : m;
    }).replace(/--tp-[a-z0-9-]+:[^;"]*;?/g, '');
  }

  var api = {
    TOKENS: TOKENS, ICONS: ICONS, register: register, list: list, get: get,
    missingTokens: missingTokens, styleVars: styleVars, el: el, render: render,
    renderScreen: renderScreen, context: context, resolveVars: resolveVars, components: C
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThemePack = api;
})(this);
