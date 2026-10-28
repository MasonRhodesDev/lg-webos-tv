import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A horizontal ribbon of tiles; focus scrolls into view. `model` is a list of tile specs ({ label, sub, icon, image,
// hue, badge, badgeTone, chip, chipTone, current, disabled, width, lead, heading }) or { separator: true, width }.
// `heading` starts a group: its name sits above the tile, `lead` px of extra space before it. An LG-mirrored surface
// (the input picker) sets currentIndex from LG and, with `follows: false`, places the ribbon itself so its tiles stay
// over LG's; our own menus give it focus and it moves with Left/Right (wrapping if `wraps`).
ListView {
    id: ribbon
    property bool focusShown: true
    property bool wraps: false
    // False: the ribbon never scrolls or fades tiles out of view; its owner places it (an LG-mirrored surface).
    property bool follows: true
    property real tileHeight: Look.px("tile-h")
    // How far above the tiles group headings reach.
    readonly property real headingSpace: probe.height + Look.px("space-s")
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
    height: tileHeight
    spacing: Look.px("space-m")
    interactive: false
    boundsBehavior: Flickable.StopAtBounds
    highlightFollowsCurrentItem: false

    // Scroll only as far as keeps the focused tile, and part of the next, inside the ribbon, starting from `from`: where
    // it is when focus moves, its start when its size changes (as RowList).
    function reveal(animated, from) {
        if (from === undefined) from = contentX;
        var item = currentItem;
        if (!item || !follows) return;
        var margin = Look.px("tile-w") / 2, to = from;
        if (item.x - margin < from) to = item.x - margin;
        else if (item.x + item.width + margin > from + width) to = item.x + item.width + margin - width;
        to = Math.max(originX, Math.min(to, originX + contentWidth - width));
        if (to === contentX) return;
        scroll.stop();
        if (!animated) { contentX = to; return; }
        scroll.to = to;
        scroll.start();
    }
    NumberAnimation { id: scroll; target: ribbon; property: "contentX"; duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-enter") }
    onCurrentIndexChanged: reveal(true, contentX)
    onWidthChanged: reveal(false, originX)
    onContentWidthChanged: reveal(false, originX)

    Keys.onPressed: {
        var k = KeyMap.nav(event, Qt);
        if (k === "left") move(-1);
        else if (k === "right") move(1);
        else if (k === "ok" && spec(currentIndex)) activated(currentIndex, spec(currentIndex));
        else if (k === "back") back();
        else return;
        event.accepted = true;
    }

    Label { id: probe; visible: false; role: "heading"; text: "X" }

    delegate: Item {
        id: slot
        readonly property var t: modelData
        readonly property int at: index
        readonly property real lead: t.lead || 0
        width: t.separator ? (t.width !== undefined ? t.width : Look.px("space-xs")) : lead + (t.width || Look.px("tile-w"))
        height: ribbon.height
        z: at === ribbon.currentIndex ? 2 : 0
        readonly property bool inView: x >= ribbon.contentX - 1 && x + width <= ribbon.contentX + ribbon.width + 1
        opacity: inView || !ribbon.follows ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }

        Rectangle {
            visible: !!slot.t.separator
            anchors.centerIn: parent
            width: Look.px("edge-w") * 2
            height: parent.height * 0.6
            radius: width / 2
            color: Look.color("divider")
        }
        Label {
            visible: !slot.t.separator && !!slot.t.heading
            x: slot.lead
            y: -ribbon.headingSpace
            width: slot.width - slot.lead
            role: "heading"
            text: slot.t.heading || ""
            color: Look.color("ink-3")
        }
        Tile {
            visible: !slot.t.separator
            x: slot.lead
            width: slot.width - slot.lead
            height: ribbon.tileHeight
            label: slot.t.label || ""
            sub: slot.t.sub || ""
            icon: slot.t.icon || ""
            image: slot.t.image || ""
            hue: slot.t.hue !== undefined ? slot.t.hue : -1
            badge: slot.t.badge || ""
            badgeTone: slot.t.badgeTone || "neutral"
            chip: slot.t.chip || ""
            chipTone: slot.t.chipTone || "attention"
            current: !!slot.t.current
            disabled: !!slot.t.disabled
            focused: ribbon.focusShown && slot.at === ribbon.currentIndex
        }
    }
}
