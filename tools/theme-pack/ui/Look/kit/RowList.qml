import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A focusable vertical list of rows and section headers. `model` is a list of row specs: { section: "Title" } for a
// header, or a ListRow's properties ({ variant, label, hint, value, icon, hue, on, checked, fraction, valueText,
// options, index, chip, chipTone, current, disabled }). Data in, events out: the list never changes its model.
//
// An LG-mirrored surface sets currentIndex from LG. Our own menus give the list focus and it handles the keys:
// Up/Down move over focusable rows, OK is activated(), Left/Right step a slider or stepper row (adjusted()), and
// Back is back(). Focus scrolls into view; rows not wholly inside the list fade out, so the list needs no clip and
// focus decoration is never cut.
//
// Live data: set `rows` (the specs) and `model: rows.length` instead. A new `rows` of the same length then updates
// the rows in place (a toggle slides, focus stays) rather than making them again.
// `pointer: true` (our own menus) lets the magic remote's pointer focus a row by hovering and activate it by a click.
ListView {
    id: list
    property bool focusShown: true
    property var rows: null
    property bool pointer: false
    signal activated(int index, var row)
    signal adjusted(int index, int delta)
    signal back()
    // The pointer came onto a row and focused it; `pointing` is true while that moves currentIndex.
    signal pointed(int index)
    property bool pointing: false

    readonly property int length: rows ? rows.length : model && model.length !== undefined ? model.length : 0
    function spec(i) { return i >= 0 && i < length ? (rows ? rows[i] : model[i]) : null; }
    function focusable(i) {
        var r = spec(i);
        return !!r && r.section === undefined && r.variant !== "info" && !r.disabled;
    }
    function move(d) {
        for (var i = currentIndex + d; i >= 0 && i < length; i += d)
            if (focusable(i)) { currentIndex = i; return true; }
        return false;
    }

    spacing: Look.px("space-s")
    boundsBehavior: Flickable.StopAtBounds
    interactive: false
    highlightFollowsCurrentItem: false

    // Rows not wholly inside the list are hidden, so the list stops with a row (or header) at its top edge.
    function snap(to, down) {
        var kids = contentItem.children, best = down ? Infinity : -Infinity;
        for (var i = 0; i < kids.length; i++) {
            var y = kids[i].y;
            if (kids[i].height <= 0) continue;
            if (down && y >= to - 1 && y < best) best = y;
            if (!down && y <= to + 1 && y > best) best = y;
        }
        return isFinite(best) ? best : to;
    }
    // Scroll only as far as keeps the focused row, and a row's worth beyond it, inside the list, starting from `from`.
    // Moving focus starts from where the list is (the default). A change of size starts from the top: where the list
    // opens then depends only on the focused row and the final size, not on the sizes it passed through while laid out.
    function reveal(animated, from) {
        if (from === undefined) from = contentY;
        var item = currentItem;
        if (!item) return;
        var margin = Look.px("row-h") / 2, to = from;
        if (item.y - margin < from) to = item.y - margin;
        else if (item.y + item.height + margin > from + height) to = item.y + item.height + margin - height;
        to = snap(to, to > from);
        to = Math.max(originY, Math.min(to, originY + contentHeight - height));
        if (to === contentY) return;
        scroll.stop();
        if (!animated) { contentY = to; return; }
        scroll.to = to;
        scroll.start();
    }
    NumberAnimation { id: scroll; target: list; property: "contentY"; duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-enter") }
    onCurrentIndexChanged: reveal(true, contentY)
    onHeightChanged: reveal(false, originY)
    onContentHeightChanged: reveal(false, originY)

    Keys.onPressed: {
        var k = KeyMap.nav(event, Qt), r = spec(currentIndex);
        if (k === "up") move(-1);
        else if (k === "down") move(1);
        else if (k === "ok" && r) activated(currentIndex, r);
        else if ((k === "left" || k === "right") && r && (r.variant === "slider" || r.variant === "stepper")) adjusted(currentIndex, k === "left" ? -1 : 1);
        else if (k === "back") back();
        else return;
        event.accepted = true;
    }

    // More rows below than fit: a quiet chevron at the foot says so. Parented to the list itself, so it stays put.
    Icon {
        parent: list
        name: "M6 9l6 6 6-6"
        size: Look.px("icon") * 0.8
        color: Look.color("ink-3")
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: -height
        opacity: list.contentY + list.height < list.originY + list.contentHeight - 2 ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }
    }

    delegate: Item {
        id: slot
        readonly property var r: list.rows ? (list.rows[index] || {}) : modelData
        readonly property int at: index
        readonly property bool header: r.section !== undefined
        width: list.width
        height: header ? section.height : row.height
        z: row.focused ? 2 : 0
        readonly property bool inView: y >= list.contentY - 1 && y + height <= list.contentY + list.height + 1
        opacity: inView ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }

        Section { id: section; visible: slot.header; text: slot.header ? slot.r.section : "" }
        ListRow {
            id: row
            visible: !slot.header
            variant: slot.r.variant || "nav"
            label: slot.r.label || ""
            hint: slot.r.hint || ""
            value: slot.r.value || ""
            icon: slot.r.icon || ""
            hue: slot.r.hue !== undefined ? slot.r.hue : -1
            on: !!slot.r.on
            checked: !!slot.r.checked
            fraction: slot.r.fraction || 0
            valueText: slot.r.valueText !== undefined ? String(slot.r.valueText) : ""
            options: slot.r.options || []
            index: slot.r.index || 0
            chip: slot.r.chip !== undefined ? String(slot.r.chip) : ""
            chipTone: slot.r.chipTone || "attention"
            current: !!slot.r.current
            disabled: !!slot.r.disabled
            busy: !!slot.r.busy
            focused: list.focusShown && slot.at === list.currentIndex && !slot.header
        }
        MouseArea {
            anchors.fill: parent
            enabled: list.pointer && list.focusable(slot.at)
            hoverEnabled: enabled
            onEntered: { list.pointing = true; list.currentIndex = slot.at; list.pointing = false; list.pointed(slot.at); }
            onClicked: { list.pointing = true; list.currentIndex = slot.at; list.pointing = false; list.activated(slot.at, slot.r); }
            // The magic remote's wheel steps a slider row: one notch (120) is one step, away from you is up.
            property real wheelRest: 0
            onWheel: {
                var r = slot.r;
                if (!r || r.variant !== "slider") { wheel.accepted = false; return; }
                wheelRest += wheel.angleDelta.y;
                var steps = wheelRest > 0 ? Math.floor(wheelRest / 120) : Math.ceil(wheelRest / 120);
                wheelRest -= steps * 120;
                list.currentIndex = slot.at;
                for (var i = 0; i < Math.abs(steps); i++) list.adjusted(slot.at, steps > 0 ? 1 : -1);
                wheel.accepted = true;
            }
        }
    }
}
