// Where a component's box sits in the passes it joins (Passes.qml): the component's own box, carried up through each
// item between it and the scope's body by that item's scale about its transformOrigin and its x and y. Opacity
// multiplies on the way. Rotation and `transform` lists are not carried (a transform list has no change signal):
// move and grow components with x, y and scale. Called from a binding, so every property read here is a dependency: an idle screen
// evaluates nothing, and a scroll or a focus scale re-evaluates only the components that move.
var HOME = { "x": 0, "y": 0, "scale": 1, "opacity": 1 };

// The item's transformOrigin as a point in its own box (Item.TopLeft = 0 … Item.BottomRight = 8).
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

// The passes a component joins: the nearest Passes body above it, unless another component's origin or an
// attachment layer comes first. A component inside another's origin (a toggle's knob in a row) is part of that
// origin and keeps its layers to itself, so it moves with it when the row lifts.
function scopeOf(item) {
    for (var p = item.parent; p; p = p.parent) {
        var role = p.layerRole;
        if (role === "scope") return p.passes;
        if (role === "origin" || role === "attach") return null;
    }
    return null;
}

// Whether any component in these passes is showing, and how much: the screen's own decoration follows it.
function presence(planes) {
    var most = 0;
    for (var i = 0; i < planes.length; i++) {
        var kids = planes[i].children;
        for (var j = 0; j < kids.length; j++)
            if (kids[j].visible && kids[j].opacity > most) most = kids[j].opacity;
    }
    return most;
}
