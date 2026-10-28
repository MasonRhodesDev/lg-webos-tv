import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// The layer model's paint order (the design canvas's layers page, boards 3 and 5), read from the item tree: which plane
// each layer lives in, and the order the scene graph paints them in (children by z, then by index). Exits 1 on the
// first failure: qml Passes.qml
Window {
    id: win
    width: 1920; height: 1080
    visible: true

    // A theme like board 3's: every tile's back decoration bleeds into its neighbours, focus adds a wider glow and a
    // ring, and chips have their own back decoration.
    readonly property var theme: ({ "id": "board", "recipes": [
        { "target": "tile", "slot": "back", "when": "always", "outset": 40, "fill": "#DCE6FA" },
        { "target": "*", "slot": "back", "when": "focused", "outset": { "rest": 24, "focused": 70 }, "fill": "#A9C1F2" },
        { "target": "*", "slot": "front", "when": "focused", "outset": 6, "stroke": "#E0662B", "strokeWidth": 6 },
        { "target": "row", "slot": "back", "when": "always", "outset": [0, 0, 0, 30], "fill": "#C8D7F6" },
        { "target": "panel", "slot": "back", "when": "always", "outset": 32, "fill": "#DCE6FA" },
        { "target": "panel", "slot": "front", "when": "always", "outset": 0, "stroke": "#1B1D20" },
        { "target": "chip", "slot": "back", "when": "always", "outset": 6, "fill": "#7A3FB8" }
    ] })

    Item {
        id: sceneRoot
        anchors.fill: parent
        Screen {
            id: screenA
            Row {
                id: tiles
                x: 200; y: 200
                spacing: 40
                Tile { id: t1; label: "One"; chip: "3" }
                Tile { id: t2; label: "Two"; focused: true }
                Tile { id: t3; label: "Three" }
            }
        }
        Screen {
            id: screenB
            Panel {
                id: panel
                x: 1000; y: 500
                width: 640
                RowList {
                    id: rows
                    width: parent.width
                    height: 3 * Look.px("row-h") + 2 * Look.px("space-s")
                    currentIndex: 1
                    model: [
                        { variant: "nav", label: "Notifications", chip: "3" },
                        { variant: "toggle", label: "Energy saving", on: true },
                        { variant: "nav", label: "Network" }
                    ]
                }
            }
        }
    }

    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) { Qt.exit(1); throw new Error("passes: failed"); }
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
    // Every item in the order the scene graph paints it: an item, then its children by z (stable by index).
    function paintOrder(item, out) {
        out.push(item);
        var kids = [];
        for (var i = 0; i < item.children.length; i++) kids.push({ "item": item.children[i], "i": i });
        kids.sort(function (a, b) { return a.item.z - b.item.z || a.i - b.i; });
        for (var j = 0; j < kids.length; j++) paintOrder(kids[j].item, out);
        return out;
    }
    // Asserts these passes paint in this order: each is [label, item or [items]]; items within one pass may paint in
    // any order among themselves, and every one of them paints after every item of the pass before.
    function inOrder(list, what) {
        var order = paintOrder(sceneRoot, []), prev = -1, prevLabel = "";
        for (var i = 0; i < list.length; i++) {
            var items = list[i][1].length !== undefined ? list[i][1] : [list[i][1]], lo = Infinity, hi = -1;
            for (var j = 0; j < items.length; j++) {
                var at = order.indexOf(items[j]);
                if (at < 0) return check(false, what + ": " + list[i][0] + " is not painted");
                lo = Math.min(lo, at);
                hi = Math.max(hi, at);
            }
            if (lo < prev) return check(false, what + ": " + list[i][0] + " paints before " + prevLabel);
            prev = hi;
            prevLabel = list[i][0];
        }
        check(true, what);
    }
    // The rings drawn in one of a component's layers (the Repeater's items, beside the Repeater itself).
    function rings(layer) {
        var out = [], kids = layer.children[0].children;
        for (var i = 0; i < kids.length; i++) if (kids[i].recipe !== undefined) out.push(kids[i]);
        return out;
    }
    function near(a, b) { return Math.abs(a - b) < 0.5; }
    function rowDecor(i) { return decorOf(rows.contentItem.children[i] || null, "row"); }
    function rowAt(i) {
        var kids = rows.contentItem.children;
        for (var k = 0; k < kids.length; k++) if (kids[k].at === i) return decorOf(kids[k], "row");
        return null;
    }

    property int step: 0
    readonly property var steps: [
        function () {
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": ["board"] },
                "style": { "id": "smoke", "tokens": { "focus-scale": "1.04" } }, "themes": [win.theme] }));
        },
        function () {
            var d1 = decorOf(t1, "tile"), d2 = decorOf(t2, "tile"), d3 = decorOf(t3, "tile"), s = screenA.surfaces;
            check(d1.scope === s && d2.scope === s && d3.scope === s, "board 3: the three tiles join the screen's passes");
            check(d1.layers.back.parent === s.back && d3.layers.back.parent === s.back, "resting tiles: −1 in the back plane");
            check(d1.layers.origin.parent === d1 && d3.layers.origin.parent === d3, "resting tiles: origins stay in layout");
            check(d1.layers.front.parent === s.front && d1.layers.attach.parent === s.attach, "resting tiles: +1 and attachments in their planes");
            check(s.back.z < s.contentItem.z && s.contentItem.z < s.front.z && s.front.z < s.attach.z && s.attach.z < s.lift.z,
                  "planes: back < content < front < attach < lift (z, one parent)");
            check(s.back.parent === s && s.contentItem.parent === s && s.lift.parent === s, "planes are siblings");
            var lifted = d2.layers;
            check(d2.lifted && lifted.lift.parent === s.lift, "focused tile: its stack is in the lift plane");
            check(lifted.back.parent === lifted.lift && lifted.origin.parent === lifted.lift && lifted.front.parent === lifted.lift
                  && lifted.attach.parent === lifted.lift, "focused tile: −1, 0, +1 and attachments all lifted together");
            check(lifted.back.z === 1 && lifted.origin.z === 2 && lifted.front.z === 3 && lifted.attach.z === 4, "focused tile: its own −1 < 0 < +1 < attachments");
            var chip = d1.layers.attach.children[1];
            check(chip.text === "3" && chip.visible, "tile 1's chip is an attachment of tile 1");
            check(near(chip.x + chip.width / 2, t1.width) && near(chip.y + chip.height / 2, 0), "the chip is centred on the anchor (100%, 0%)");
            inOrder([["−1 · 1,3", [d1.layers.back, d3.layers.back]], ["0 · 1,3", [d1.layers.origin, d3.layers.origin]],
                     ["+1 · 1,3", [d1.layers.front, d3.layers.front]], ["att · 1 (the chip)", chip], ["tile 2 −1", lifted.back], ["tile 2 origin", lifted.origin], ["tile 2 +1", lifted.front],
                     ["tile 2 attachments", lifted.attach]], "board 3, option C: passes for tiles 1 and 3, then tile 2's whole stack");
            var glow = rings(d2.layers.back).filter(function (r) { return r.recipe.when === "focused"; })[0];
            check(glow && near(glow.ol, 70) && near(glow.x, -70), "focused tile: the per-state outset reads its focused value (70)");
        },
        function () {
            // Geometry follows the origin: the focused tile is scaled (focus-scale 1.04) and the row moves.
            var d2 = decorOf(t2, "tile"), s = screenA.surfaces, at = d2.mapToItem(s.contentItem, 0, 0);
            check(near(d2.layers.origin.x, at.x) && near(d2.layers.origin.y, at.y), "lifted origin sits where its layout slot is");
            check(near(t2.scale, 1.04) && near(d2.place.scale, 1.04), "lifted layers carry the tile's focus scale");
            tiles.x = 260;
        },
        function () {
            var d1 = decorOf(t1, "tile"), d2 = decorOf(t2, "tile"), s = screenA.surfaces;
            check(near(d1.layers.back.x, d1.mapToItem(s.contentItem, 0, 0).x) && near(d2.layers.origin.x, d2.mapToItem(s.contentItem, 0, 0).x),
                  "moving the row moves every plane's layers with their origins");
            check(tiles.children.length === 3, "the Row lays out only the tiles: no ring item is a child of the positioner");
            t2.focused = false;
            t3.focused = true;
        },
        function () {
            var d1 = decorOf(t1, "tile"), d2 = decorOf(t2, "tile"), d3 = decorOf(t3, "tile");
            check(d2.layers.origin.parent === d2 && d2.layers.back.parent === screenA.surfaces.back, "focus leaves tile 2: its layers rejoin the passes");
            var chip = d1.layers.attach.children[1];
            inOrder([["tile 2 −1 (resting, bleeding)", d2.layers.back], ["tile 1 origin", d1.layers.origin], ["tile 2 +1", d2.layers.front],
                     ["tile 1 chip", chip], ["tile 3 lifted", d3.layers.lift]], "no resting decoration paints over tile 1's chip");
        },
        function () {
            // Board 5: a row with a chip inside a panel. The rows join the panel's passes, which live in the panel's origin.
            var pd = decorOf(panel, "panel"), r0 = rowAt(0), r1 = rowAt(1), r2 = rowAt(2), pp = panel.body.passes;
            check(pd.scope === screenB.surfaces, "the panel joins the screen's passes");
            check(r0.scope === pp && r1.scope === pp && r0.scope !== screenB.surfaces, "rows join the panel's passes, not the screen's");
            var up = pp;
            while (up && up !== pd.layers.origin) up = up.parent;
            check(up === pd.layers.origin, "the panel's passes are inside the panel's origin");
            check(r1.lifted && r1.layers.lift.parent === pp.lift, "the focused row lifts within the panel");
            var knob = decorOf(r1.layers.origin, "knob");
            check(knob && knob.scope === null && knob.layers.front.parent === knob, "a toggle's knob is part of its row's origin and lifts with it");
            var chip = r0.layers.attach.children[0];
            check(chip.text === "3" && chip.visible && r0.layers.attach.parent === pp.attach, "row 0's chip is an attachment in the panel's passes");
            inOrder([["panel −1", pd.layers.back], ["panel surface", pd.layers.origin.children[0]], ["rows −1", [r0.layers.back, r2.layers.back]],
                     ["rows 0", [r0.layers.origin, r2.layers.origin]], ["rows +1", [r0.layers.front, r2.layers.front]], ["row 0 chip", chip], ["row 1 lifted", r1.layers.lift],
                     ["panel +1", pd.layers.front]], "nested: rows paint in passes inside the panel's 0, above its −1 and below its +1");
            var reach = rings(r0.layers.back).filter(function (r) { return r.recipe.target === "row"; })[0];
            check(reach && near(reach.x, -30) && near(r0.layers.back.x, 0) && near(r0.place.x + reach.x, -30), "row decoration reaches into the panel's padding (its margin) unclipped");
            check(!pp.clip && !rows.clip && !panel.clip, "nothing between the row and the screen clips");
        },
        function () {
            check(screenB.decorated === 1, "the screen's own decoration shows while a surface is open");
            panel.shown = false;
        },
        function () {},
        function () {},
        function () {},
        function () {},
        function () {
            check(screenB.decorated === 0, "with every surface closed, the screen's decoration is hidden (no sky over bare video)");
            console.log("passes: all passed");
            Qt.quit();
        }
    ]

    Timer {
        interval: 120
        repeat: true
        running: true
        onTriggered: { win.steps[win.step++](); if (win.step >= win.steps.length) stop(); }
    }
    Timer { interval: 15000; running: true; onTriggered: { console.error("passes: timed out"); Qt.exit(1); } }
}
