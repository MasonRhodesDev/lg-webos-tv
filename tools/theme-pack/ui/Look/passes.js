var HOME = { "x": 0, "y": 0, "scale": 1, "opacity": 1 };

function pivot(item) {
    var o = item.transformOrigin;
    return { "x": item.width * (o % 3) / 2, "y": item.height * Math.floor(o / 3) / 2 };
}

function place(item, body) {
    var x = 0, y = 0, scale = 1, opacity = 1, p = item;
    for (; p && p !== body; p = p.parent) {
        if (p.scale !== 1) {
            var c = pivot(p);
            x = c.x + (x - c.x) * p.scale;
            y = c.y + (y - c.y) * p.scale;
            scale *= p.scale;
        }
        x += p.x;
        y += p.y;
        opacity *= p.opacity;
    }
    return p ? { "x": x, "y": y, "scale": scale, "opacity": opacity } : HOME;
}

function scopeOf(item) {
    for (var p = item.parent; p; p = p.parent) {
        var role = p.layerRole;
        if (role === "scope") return p.passes;
        if (role === "origin" || role === "attach") return null;
    }
    return null;
}

function presence(planes) {
    var most = 0;
    for (var i = 0; i < planes.length; i++) {
        var kids = planes[i].children;
        for (var j = 0; j < kids.length; j++)
            if (kids[j].visible && kids[j].opacity > most) most = kids[j].opacity;
    }
    return most;
}
