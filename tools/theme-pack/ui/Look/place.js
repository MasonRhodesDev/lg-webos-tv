// Where a ring sits in its outset box, read from its recipe's `style` (CSS placement syntax, which render-assets.mjs
// also reads to compose the art). The ring has every edge set by its outset; `width`/`height` in px size it, and
// `left:auto` or `top:auto` move it to the right or bottom edge (`right:auto`/`bottom:auto` keep it at the left or
// top). Without a size it fills the box. Other declarations are ignored.
function placement(style) {
    var p = { "left": false, "right": false, "top": false, "bottom": false, "width": -1, "height": -1 };
    var decls = (style || "").split(";");
    for (var i = 0; i < decls.length; i++) {
        var m = /^\s*(left|right|top|bottom|width|height)\s*:\s*(.*?)\s*$/.exec(decls[i]);
        if (!m) continue;
        if (m[1] === "width" || m[1] === "height") {
            var px = /^(\d+(?:\.\d+)?)px$/.exec(m[2]);
            if (px) p[m[1]] = Number(px[1]);
        } else if (m[2] === "auto") {
            p[m[1]] = true;
        }
    }
    return p;
}

// The ring's rectangle in its outset box of w × h.
function rect(p, w, h) {
    var rw = p.width >= 0 ? p.width : w, rh = p.height >= 0 ? p.height : h;
    return {
        "x": p.width >= 0 && p.left && !p.right ? w - rw : 0,
        "y": p.height >= 0 && p.top && !p.bottom ? h - rh : 0,
        "width": rw,
        "height": rh
    };
}

// A recipe's outset as [top, right, bottom, left] for the component's state. It is a number, four numbers, or per
// state: { rest, focused, current, disabled }, each a number or four; the first of focused, current, disabled that
// the component is in and the recipe names wins, else rest.
function sides(o) { return typeof o === "number" ? [o, o, o, o] : (o || [0, 0, 0, 0]); }
function outset(o, focused, current, disabled) {
    if (o === null || typeof o !== "object" || o.length !== undefined) return sides(o);
    var v = focused && o.focused !== undefined ? o.focused : current && o.current !== undefined ? o.current
          : disabled && o.disabled !== undefined ? o.disabled : o.rest;
    return sides(v);
}
