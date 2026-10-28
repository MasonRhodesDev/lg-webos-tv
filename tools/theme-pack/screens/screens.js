/* Screen definitions as component trees. Shared by the demo, the tests and the canvas exporter. */
(function (root) {
  'use strict';
  var TP = typeof module !== 'undefined' && module.exports ? require('../runtime/theme-pack.js') : root.ThemePack;
  var el = TP.el;

  var CATS = [
    { id: 'picture', label: 'Picture', icon: 'screen' },
    { id: 'sound', label: 'Sound', icon: 'speaker' },
    { id: 'connection', label: 'Connection', icon: 'wifi' },
    { id: 'general', label: 'General', icon: 'grid' },
    { id: 'look', label: 'Look', icon: 'palette' },
    { id: 'accessibility', label: 'Accessibility', icon: 'person' },
    { id: 'support', label: 'Support', icon: 'help' }
  ];

  function screen(o, kids) {
    return el('screen', { picture: o.picture, credit: o.credit, transparent: o.transparent }, kids);
  }

  function lookLabel(o) {
    var s = TP.get('style', o.style);
    var names = (o.themes || []).map(function (id) { var t = TP.get('theme', id); return t ? t.name : id; });
    return (s ? s.name : o.style) + (names.length ? ' · ' + names.join(' + ') : '');
  }

  var screens = {
    home: function (o) {
      var tiles = [
        el('tile', { label: 'HDMI 1', sub: 'No signal', hue: 0 }),
        el('tile', { label: 'HDMI 2', sub: '4K · 120 Hz', hue: 1, current: true, tag: 'Watching' }),
        el('tile', { label: 'HDMI 3', sub: 'Signal', hue: 2, focused: true }),
        el('tile', { label: 'HDMI 4', sub: 'No signal', hue: 3 }),
        el('tile', { label: 'Homebrew', sub: 'App', icon: 'flask', hue: 4, width: 220, attach: [{ type: 'chip', props: { text: '2' } }] }),
        el('tile', { label: 'USB', sub: 'No drive', icon: 'usb', hue: 5, width: 220, disabled: true }),
        el('tile', { label: 'Settings', sub: 'System', icon: 'sliders', hue: 6, width: 220 })
      ];
      return screen(o, [
        el('volume', { value: 21, place: 'position:absolute;top:54px;right:96px;' }),
        el('dock', { title: 'Inputs and apps', status: 'Offline', clock: '20:14',
          hints: [{ key: '◀ ▶', label: 'Move' }, { key: 'OK', label: 'Switch' }, { key: 'BACK', label: 'Close' }] }, tiles)
      ]);
    },

    quick: function (o) {
      return screen(o, [el('panel', { title: 'Quick settings', sub: 'HDMI 2 · 4K · 120 Hz', width: 640, place: 'position:absolute;left:96px;top:54px;',
        hints: [{ key: '▲ ▼', label: 'Move' }, { key: 'OK', label: 'Change' }, { key: 'BACK', label: 'Close' }] }, [
        el('row', { label: 'Picture mode', value: 'Filmmaker', control: 'drill', icon: 'screen', hue: 0 }),
        el('row', { label: 'Sound out', value: 'TV speakers', control: 'drill', icon: 'speaker', hue: 1 }),
        el('row', { label: 'Sleep timer', value: 'Off', control: 'drill', icon: 'moon', hue: 3 }),
        el('row', { label: 'Energy saving', control: 'toggle', on: true, icon: 'leaf', hue: 4 }),
        el('row', { label: 'Look', value: lookLabel(o), control: 'drill', icon: 'palette', hue: 2, focused: true }),
        el('row', { label: 'Volume', control: 'slider', pct: 21, icon: 'speaker', hue: 5 }),
        el('row', { label: 'All settings', control: 'drill', icon: 'sliders', hue: 6 })
      ])]);
    },

    look: function (o) {
      var rows = [];
      TP.list('style').forEach(function (s, i) {
        rows.push({ kind: 'style', id: s.id, node: el('row', { label: s.name, hint: 'Style', control: 'check', current: s.id === o.style, icon: 'palette', hue: i }) });
      });
      TP.list('theme').forEach(function (t, i) {
        rows.push({ kind: 'theme', id: t.id, node: el('row', { label: t.name, hint: 'Theme', control: 'toggle', on: (o.themes || []).indexOf(t.id) >= 0, icon: 'sparkle', hue: i + 3 }) });
      });
      var f = Math.max(0, Math.min(rows.length - 1, o.focus || 0));
      rows[f].node.props.focused = true;
      var tree = screen(o, [el('settings', { place: 'position:absolute;left:96px;top:54px;', cats: CATS, cat: 'look', title: 'Look',
        sub: 'One style, any themes', footer: 'Saved on this TV' }, rows.map(function (r) { return r.node; }))]);
      tree.items = rows.map(function (r) { return { kind: r.kind, id: r.id }; });
      return tree;
    },

    alert: function (o) {
      return screen(o, [
        el('dim', {}),
        el('dialog', { title: 'USB drive removed', icon: 'usb', hue: 1, place: 'position:absolute;left:560px;top:300px;',
          body: 'The drive was unplugged while it was in use. Files that were being copied may be incomplete.' }, [
          el('button', { label: 'Open USB media' }),
          el('button', { label: 'OK', focused: true })
        ])
      ]);
    }
  };

  var api = { screens: screens, CATS: CATS, lookLabel: lookLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThemePackScreens = api;
})(this);
