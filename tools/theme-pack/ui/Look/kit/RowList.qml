import QtQuick 2.4
import ".."
import "keys.js" as KeyMap

ListView {
    id: list
    property bool focusShown: true
    property var rows: null
    property bool pointer: false
    signal activated(int index, var row)
    signal adjusted(int index, int delta)
    signal back()
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
            property real wheelRest: 0
            onWheel: {
                var r = slot.r;
                if (!r || (r.variant !== "slider" && r.variant !== "stepper")) { wheel.accepted = false; return; }
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
