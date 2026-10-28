import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A horizontal ribbon of tiles; focus scrolls into view. `model` is a list of tile specs ({ label, sub, icon, image,
// hue, badge, chip, current, disabled, width }) or { separator: true }. An LG-mirrored surface (the input picker)
// sets currentIndex from LG; our own menus give it focus and it moves with Left/Right (wrapping if `wraps`).
ListView {
    id: ribbon
    property bool focusShown: true
    property bool wraps: false
    signal activated(int index, var tile)
    signal back()

    function spec(i) { return model && i >= 0 && i < model.length ? model[i] : null; }
    function focusable(i) { var t = spec(i); return !!t && !t.separator && !t.disabled; }
    function move(d) {
        var n = model.length;
        for (var s = 1; s < n; s++) {
            var i = currentIndex + d * s;
            if (wraps) i = (i + n) % n; else if (i < 0 || i >= n) return;
            if (focusable(i)) { currentIndex = i; return; }
        }
    }

    orientation: ListView.Horizontal
    height: Look.px("tile-h")
    spacing: Look.px("space-m")
    interactive: false
    boundsBehavior: Flickable.StopAtBounds
    highlight: Item {}
    highlightFollowsCurrentItem: true
    highlightMoveDuration: Look.px("motion-value")
    highlightRangeMode: ListView.ApplyRange
    preferredHighlightBegin: Look.px("tile-w")
    preferredHighlightEnd: width - Look.px("tile-w")

    Keys.onPressed: {
        var k = KeyMap.nav(event, Qt);
        if (k === "left") move(-1);
        else if (k === "right") move(1);
        else if (k === "ok" && spec(currentIndex)) activated(currentIndex, spec(currentIndex));
        else if (k === "back") back();
        else return;
        event.accepted = true;
    }

    delegate: Item {
        id: slot
        readonly property var t: modelData
        readonly property int at: index
        width: t.separator ? Look.px("space-xs") : (t.width || Look.px("tile-w"))
        height: ribbon.height
        z: at === ribbon.currentIndex ? 2 : 0
        readonly property bool inView: x >= ribbon.contentX - 1 && x + width <= ribbon.contentX + ribbon.width + 1
        opacity: inView ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }

        Rectangle {
            visible: !!slot.t.separator
            anchors.centerIn: parent
            width: Look.px("edge-w") * 2
            height: parent.height * 0.6
            radius: width / 2
            color: Look.color("divider")
        }
        Tile {
            visible: !slot.t.separator
            width: slot.width
            label: slot.t.label || ""
            sub: slot.t.sub || ""
            icon: slot.t.icon || ""
            image: slot.t.image || ""
            hue: slot.t.hue !== undefined ? slot.t.hue : -1
            badge: slot.t.badge || ""
            badgeTone: slot.t.badgeTone || "neutral"
            chip: slot.t.chip || ""
            current: !!slot.t.current
            disabled: !!slot.t.disabled
            focused: ribbon.focusShown && slot.at === ribbon.currentIndex
        }
    }
}
