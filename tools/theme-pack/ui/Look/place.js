// Where a ring sits in its outset box, read from its recipe's CSS `style`, so the HTML and QML renderers share one
// source. The ring element has every edge set by its outset; `width`/`height` in px size it, and `left:auto` or
// `top:auto` move it to the right or bottom edge (`right:auto`/`bottom:auto` keep it at the left or top). Without a
// size it fills the box. Other declarations are the HTML renderer's alone.
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
