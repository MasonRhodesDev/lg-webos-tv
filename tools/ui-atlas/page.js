(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs button'));
  var panels = {};
  document.querySelectorAll('.panel').forEach(function (p) { panels[p.dataset.tab] = p; });
  var KEY = 'webos-ui-atlas-tab';

  function fit() {
    document.querySelectorAll('.panel:not([hidden]) .tv').forEach(function (tv) {
      var w = tv.clientWidth;
      if (w > 0) tv.style.setProperty('--k', (w / 1920).toFixed(5));
    });
  }

  function show(id, push) {
    if (!panels[id]) id = 'overview';
    tabs.forEach(function (b) {
      var on = b.dataset.tab === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) { var s = b.parentNode; var l = b.offsetLeft - s.offsetLeft; if (l < s.scrollLeft || l + b.offsetWidth > s.scrollLeft + s.clientWidth) s.scrollLeft = l - 16; }
    });
    Object.keys(panels).forEach(function (k) { panels[k].hidden = k !== id; });
    if (push && location.hash !== '#' + id) {
      try { history.replaceState(null, '', '#' + id); } catch (e) { location.hash = id; }
    }
    try { localStorage.setItem(KEY, id); } catch (e) {}
    fit();
    ss(id === 'screensaver');
  }

  tabs.forEach(function (b, i) {
    b.addEventListener('click', function () { show(b.dataset.tab, true); window.scrollTo({ top: 0 }); });
    b.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      n.focus(); show(n.dataset.tab, true);
    });
  });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-tab]');
    if (a) { e.preventDefault(); show(a.dataset.tab, true); window.scrollTo({ top: 0 }); }
  });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1), false); });
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.querySelector('main'));
  window.addEventListener('resize', fit);

  // Screen saver: canvas version of the QML particle system (3 groups, centred emitters).
  var cv = document.querySelector('.ss-canvas'), ctx = cv && cv.getContext('2d'), parts = [], raf = 0, last = 0;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLS = [[40, 90, 255], [30, 210, 220], [235, 40, 60]];
  function spawn() {
    var a = Math.random() * Math.PI * 2, v = 7 + (Math.random() * 6 - 3), aa = Math.random() * Math.PI * 2, acc = 12 + (Math.random() * 10 - 5);
    return { x: 960, y: 540, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ax: Math.cos(aa) * acc, ay: Math.sin(aa) * acc,
      c: COLS[(Math.random() * 3) | 0], life: 0, span: 6 + Math.random() * 6, al: 0.1 + Math.random() * 0.9 };
  }
  function step(t) {
    var dt = Math.min(0.05, (t - last) / 1000 || 0.016); last = t;
    for (var i = 0; i < 12 && parts.length < 2400; i++) parts.push(spawn());
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    for (var j = parts.length - 1; j >= 0; j--) {
      var p = parts[j];
      p.vx += (p.ax + (Math.random() - 0.5) * 20) * dt; p.vy += (p.ay + (Math.random() - 0.5) * 20) * dt;
      p.x += p.vx * dt * 28; p.y += p.vy * dt * 28; p.life += dt;
      if (p.life > p.span) { parts.splice(j, 1); continue; }
      var fade = Math.min(1, p.life / 0.6) * Math.min(1, (p.span - p.life) / 1.5);
      ctx.fillStyle = 'rgba(' + p.c[0] + ',' + p.c[1] + ',' + p.c[2] + ',' + (p.al * fade).toFixed(3) + ')';
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    raf = requestAnimationFrame(step);
  }
  function ss(on) {
    if (!ctx) return;
    cancelAnimationFrame(raf);
    if (!on) return;
    if (reduce) {
      parts = []; for (var i = 0; i < 2400; i++) { var p = spawn(); var s = Math.random() * 8; p.x += (p.vx * s + p.ax * s * s / 2) * 14; p.y += (p.vy * s + p.ay * s * s / 2) * 14; p.life = 1; parts.push(p); }
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
      parts.forEach(function (p) { ctx.fillStyle = 'rgba(' + p.c + ',' + p.al + ')'; ctx.fillRect(p.x, p.y, 3, 3); });
      return;
    }
    if (!parts.length) for (var k = 0; k < 1500; k++) { var q = spawn(); q.life = Math.random() * q.span; var s2 = q.life; q.vx += q.ax * s2; q.vy += q.ay * s2; q.x += (q.vx * s2) * 14; q.y += (q.vy * s2) * 14; parts.push(q); }
    last = performance.now(); raf = requestAnimationFrame(step);
  }
  if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); }

  var start = location.hash.slice(1);
  if (!panels[start]) { try { start = localStorage.getItem(KEY) || 'overview'; } catch (e) { start = 'overview'; } }
  show(start, false);
  window.scrollTo(0, 0);
  setTimeout(function () { window.scrollTo(0, 0); fit(); }, 0);
})();
