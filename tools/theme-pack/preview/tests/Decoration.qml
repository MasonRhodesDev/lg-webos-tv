import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// What themes may and may not do to a component, read from the item tree: themes off leaves the ±1 layers in place
// and empty, later themes wrap further out, attachments and controls are dressed as components of their own, and a
// disabled component keeps its plate while its decoration recedes. Exits 1 on the first failure: qml Decoration.qml
Window {
    id: win
    width: 1920; height: 1080
    visible: true

    function theme(id, fill) {
        return { "id": id, "recipes": [
            { "target": "tile", "slot": "back", "when": "always", "outset": 10, "fill": fill },
            { "target": "tile", "slot": "front", "when": "always", "outset": 4, "stroke": fill, "strokeWidth": 2 },
            { "target": "chip", "slot": "back", "when": "always", "outset": 6, "fill": fill },
            { "target": "thumb", "slot": "front", "when": "always", "outset": 6, "stroke": fill, "strokeWidth": 2 },
            { "target": "knob", "slot": "front", "when": "always", "outset": 6, "stroke": fill, "strokeWidth": 2, "opacity": 0.8 }
        ] };
    }
    function look(themes) {
        Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": themes.map(function (t) { return t.id; }) },
            "style": { "id": "smoke", "tokens": {} }, "themes": themes }));
    }

    Screen {
        id: screen
        Row {
            x: 200; y: 200
            spacing: 40
            Tile { id: plain; label: "One"; chip: "3"; focused: true }
            Tile { id: off; label: "Two"; disabled: true }
        }
        Slider { id: slider; x: 200; y: 600; fraction: 0.4 }
        Toggle { id: toggle; x: 600; y: 600; on: true }
    }

    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) { Qt.exit(1); throw new Error("decoration: failed"); }
    }
    function decorOf(item, target) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].layers !== undefined && kids[i].target === target) return kids[i];
            var d = decorOf(kids[i], target);
            if (d) return d;
        }
        return null;
    }
    function rings(layer) {
        var out = [], kids = layer.children[0].children;
        for (var i = 0; i < kids.length; i++) if (kids[i].recipe !== undefined) out.push(kids[i]);
        return out;
    }
    function ids(list) { return list.map(function (r) { return r.theme; }).join(","); }
    function near(a, b) { return Math.abs(a - b) < 0.5; }
    function plateOf(item) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].inverted !== undefined && kids[i].rest !== undefined) return kids[i];
            var p = plateOf(kids[i]);
            if (p) return p;
        }
        return null;
    }

    property int step: 0
    readonly property var steps: [
        function () { look([]); },
        function () {
            var d = decorOf(plain, "tile");
            check(d.layers.back && d.layers.front, "themes off: the −1 and +1 layers are still there");
            check(rings(d.layers.back).length === 0 && rings(d.layers.front).length === 0, "themes off: both are empty");
            var thumb = decorOf(slider, "thumb");
            check(rings(thumb.layers.front).length === 0 && near(thumb.x + thumb.width / 2, slider.width * 0.4),
                  "themes off: the slider's end still sits at its level, undecorated");
            var c0 = decorOf(d.layers.attach, "chip");
            check(c0 !== null && c0.visible && c0.parent.text === "3", "themes off: the chip is still shown");
            look([theme("inner", "#DCE6FA"), theme("outer", "#7A3FB8")]);
        },
        function () {
            var d = decorOf(plain, "tile");
            check(ids(rings(d.layers.back)) === "outer,inner", "later themes wrap further out: back rings in reverse (" + ids(rings(d.layers.back)) + ")");
            check(ids(rings(d.layers.front)) === "inner,outer", "later themes wrap further out: front rings in order (" + ids(rings(d.layers.front)) + ")");
            var chip = decorOf(d.layers.attach, "chip");
            check(chip && ids(rings(chip.layers.back)) === "outer,inner", "the chip is dressed as a component of its own");
            var thumb = decorOf(slider, "thumb"), knob = decorOf(toggle, "knob");
            check(rings(thumb.layers.front).length === 2, "the slider's thumb takes theme rings");
            check(rings(knob.layers.front).length === 2, "the toggle's knob takes theme rings");
            check(near(rings(knob.layers.front)[0].opacity, 0.8), "a ring keeps its recipe's opacity on an enabled component");
            var dd = decorOf(off, "tile"), r = rings(dd.layers.back);
            check(r.length === 2 && near(r[0].opacity, 0.5) && near(rings(dd.layers.front)[0].opacity, 0.5),
                  "decoration on a disabled component recedes with it (half opacity)");
            check(near(rings(d.layers.back)[0].opacity, 1), "and on an enabled one it does not");
            var p = plateOf(dd.layers.origin);
            check(p && Qt.colorEqual(p.fill, p.rest) && Qt.colorEqual(p.rest, Look.color("surface")), "disabled keeps its surface plate");
            check(Qt.colorEqual(p.ink, Look.color("ink-disabled")), "only its ink changes, to ink-disabled");
            console.log("decoration: all passed");
            Qt.quit();
        }
    ]

    Timer {
        interval: 120
        repeat: true
        running: true
        onTriggered: { win.steps[win.step++](); if (win.step >= win.steps.length) stop(); }
    }
    Timer { interval: 15000; running: true; onTriggered: { console.error("decoration: timed out"); Qt.exit(1); } }
}
