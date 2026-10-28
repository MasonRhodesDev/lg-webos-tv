(function () {
  'use strict';
  var TP = window.ThemePack, S = window.ThemePackScreens.screens;
  var ORDER = ['home', 'quick', 'look', 'alert'];
  var KEY = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 461, escape: 27, backspace: 8 };
  var STORE = 'theme-pack.look';

  var q = new URLSearchParams(location.search);
  // On webOS, launch parameters arrive in PalmSystem.launchParams; they take the same keys as the query.
  try {
    var lp = window.PalmSystem && window.PalmSystem.launchParams ? JSON.parse(window.PalmSystem.launchParams) : {};
    Object.keys(lp).forEach(function (k) { q.set(k, String(lp[k])); });
  } catch (e) { /* no launch parameters */ }
  var tv = window.THEME_PACK_TV === true || q.get('tv') === '1';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { saved = {}; }

  var state = {
    screen: ORDER.indexOf(q.get('screen')) >= 0 ? q.get('screen') : 'home',
    style: TP.get('style', q.get('style')) ? q.get('style') : (TP.get('style', saved.style) ? saved.style : 'smoke'),
    themes: q.has('themes') ? q.get('themes').split(',').filter(function (t) { return TP.get('theme', t); })
      : (saved.themes || []).filter(function (t) { return TP.get('theme', t); }),
    focus: 0,
    picture: q.get('picture') || ''
  };

  if (!tv && q.get('fonts') !== 'none') {
    var fams = TP.list('style').map(function (s) { return 'family=' + s.font.google; }).join('&');
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + fams + '&display=swap';
    document.head.appendChild(link);
  }
  if (tv || q.get('chrome') === '0') document.getElementById('bar').style.display = 'none';

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ style: state.style, themes: state.themes })); } catch (e) { /* storage may be unavailable */ }
  }

  var current;
  function draw() {
    current = S[state.screen]({ style: state.style, themes: state.themes, focus: state.focus, picture: state.picture });
    document.getElementById('stage').innerHTML = TP.renderScreen(current, { style: state.style, themes: state.themes });
    syncBar();
    fit();
  }

  function fit() {
    var bar = document.getElementById('bar');
    var h = window.innerHeight - (bar.style.display === 'none' ? 0 : bar.offsetHeight);
    var k = Math.min(window.innerWidth / 1920, h / 1080);
    var st = document.getElementById('stage');
    st.style.webkitTransform = st.style.transform = 'scale(' + k + ')';
  }

  function activate() {
    var item = current.items && current.items[state.focus];
    if (!item) return;
    if (item.kind === 'style') state.style = item.id;
    if (item.kind === 'theme') {
      var i = state.themes.indexOf(item.id);
      if (i >= 0) state.themes.splice(i, 1); else state.themes.push(item.id);
    }
    save();
    draw();
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode, n = current.items ? current.items.length : 0;
    if (k === KEY.left || k === KEY.right) {
      var i = ORDER.indexOf(state.screen) + (k === KEY.right ? 1 : -1);
      state.screen = ORDER[(i + ORDER.length) % ORDER.length];
      state.focus = 0;
    } else if (k === KEY.up && n) {
      state.focus = (state.focus + n - 1) % n;
    } else if (k === KEY.down && n) {
      state.focus = (state.focus + 1) % n;
    } else if (k === KEY.enter) {
      activate();
      return;
    } else if (k === KEY.back || k === KEY.escape || k === KEY.backspace) {
      if (tv && state.screen === 'home') { window.close(); return; }
      state.screen = 'home';
    } else {
      return;
    }
    e.preventDefault();
    draw();
  });

  function syncBar() {
    var sc = document.getElementById('screen'), sy = document.getElementById('style'), th = document.getElementById('themes');
    if (!sc.options.length) {
      ORDER.forEach(function (n) { sc.add(new Option(n, n)); });
      TP.list('style').forEach(function (s) { sy.add(new Option(s.name, s.id)); });
      sc.onchange = function () { state.screen = sc.value; state.focus = 0; draw(); };
      sy.onchange = function () { state.style = sy.value; save(); draw(); };
      th.innerHTML = TP.list('theme').map(function (t) {
        return '<label><input type="checkbox" value="' + t.id + '"> ' + t.name + '</label>';
      }).join('');
      Array.prototype.forEach.call(th.querySelectorAll('input'), function (box) {
        box.onchange = function () {
          var i = state.themes.indexOf(box.value);
          if (box.checked && i < 0) state.themes.push(box.value);
          if (!box.checked && i >= 0) state.themes.splice(i, 1);
          save();
          draw();
        };
      });
    }
    sc.value = state.screen;
    sy.value = state.style;
    Array.prototype.forEach.call(th.querySelectorAll('input'), function (box) { box.checked = state.themes.indexOf(box.value) >= 0; });
  }

  window.addEventListener('resize', fit);
  draw();
})();
