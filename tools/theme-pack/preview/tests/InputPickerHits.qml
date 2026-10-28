import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// The input picker keeps LG's hit areas: in every state of the picker scene, each of our tiles sits exactly over
// LG's tile, and our add-on button over LG's. Prints each check and exits 1 on the first failure:
// qml InputPickerHits.qml
Window {
    id: win
    width: 1920; height: 1080
    visible: true

    property var scene: null
    property var part: null
    property var names: []
    property int step: -1

    function fail(text) { console.log("FAIL " + text); Qt.exit(1); }
    function find(item, test) {
        if (test(item)) return item;
        for (var i = 0; i < item.children.length; i++) { var hit = find(item.children[i], test); if (hit) return hit; }
        return null;
    }
    function box(item) { var p = item.mapToItem(null, 0, 0); return { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(item.width), h: Math.round(item.height) }; }
    function same(a, b) { return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h; }
    function show(b) { return b.x + "," + b.y + " " + b.w + "x" + b.h; }

    function check(name) {
        var lgRibbon = scene.lg.mainRibbon;
        var ours = find(part, function (it) { return it.follows !== undefined && it.tileHeight !== undefined; });
        if (!ours) return fail(name + ": no TileRibbon in the part");
        var checked = 0;
        var lgSlots = lgRibbon.contentItem.children;
        for (var i = 0; i < lgSlots.length; i++) {
            var lgSlot = lgSlots[i];
            if (lgSlot.hit === undefined || lgSlot.at === undefined) continue;
            var want = box(lgSlot.hit);
            if (want.x + want.w <= 0 || want.x >= win.width) continue;
            var idx = part.map[lgSlot.at];
            var slot = find(ours.contentItem, function (it) { return it.at === idx && it.lead !== undefined; });
            if (!slot) return fail(name + ": no tile of ours for LG's index " + lgSlot.at);
            var tile = find(slot, function (it) { return it.label !== undefined && it.badge !== undefined; });
            var got = box(tile);
            if (!same(got, want)) return fail(name + ": tile " + lgSlot.at + " at " + show(got) + ", LG's at " + show(want));
            checked++;
            var lgAddon = find(lgSlot.hit, function (it) { return it.tooltipText !== undefined; });
            if (lgAddon && lgAddon.visible) {
                var button = find(part, function (it) { return it.icon !== undefined && it.label !== undefined && it.hue !== undefined && it.badge === undefined; });
                if (!button || !button.visible) return fail(name + ": LG shows an add-on button, ours is hidden");
                if (!same(box(button), box(lgAddon))) return fail(name + ": add-on at " + show(box(button)) + ", LG's at " + show(box(lgAddon)));
                console.log("ok " + name + ": add-on over LG's");
            }
        }
        if (!checked) return fail(name + ": no tiles in view");
        console.log("ok " + name + ": " + checked + " tiles over LG's");
    }

    Timer {
        id: tick
        interval: 400
        onTriggered: {
            if (win.step >= 0) win.check(win.names[win.step]);
            win.step++;
            if (win.step >= win.names.length) { console.log("input picker hits: all passed"); Qt.quit(); return; }
            win.scene.state = win.names[win.step] === "base" ? "" : win.names[win.step];
            start();
        }
    }

    Component.onCompleted: {
        Fixture.load("{}");
        var sc = Qt.createComponent(Qt.resolvedUrl("../scenes/InputPicker.qml"));
        if (sc.status === Component.Error) return fail(sc.errorString());
        scene = sc.createObject(win.contentItem, { "width": 1920, "height": 1080 });
        var pc = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/parts/InputPicker.qml"));
        if (pc.status === Component.Error) return fail(pc.errorString());
        part = pc.createObject(win.contentItem);
        if (!part.claims(scene.lg)) return fail("the part does not claim the scene's view");
        part.lg = scene.lg;
        var n = ["base"];
        for (var i = 0; i < scene.states.length; i++) if (scene.states[i].name !== "closed") n.push(scene.states[i].name);
        names = n;
        tick.start();
    }
}
