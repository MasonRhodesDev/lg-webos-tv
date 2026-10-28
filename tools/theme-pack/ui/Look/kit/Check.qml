import QtQuick 2.4
import Look 1.0

// One of several that can all be on: a box, filled and ticked when on. Decoratable as `check`.
// `under` is the colour it sits on, for the tick when inverted.
Item {
    id: check
    property bool checked: false
    property bool disabled: false
    property bool inverted: false
    property color under: Look.color("focus")
    readonly property color accent: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("current")
    width: Look.px("knob-size")
    height: width

    Decor {
        target: "check"
        current: check.checked
        disabled: check.disabled
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: Math.min(Look.px("r-key"), width / 2) / 2
            color: check.checked ? check.accent : "transparent"
            border.width: check.checked ? 0 : Math.round(check.width / 10)
            border.color: check.inverted ? Look.color("focus-ink") : check.disabled ? Look.color("ink-disabled") : Look.color("ink-3")
            Behavior on color { ColorAnimation { duration: Look.px("motion-value") } }
        }
        Icon {
            anchors.centerIn: parent
            visible: check.checked
            name: "check"
            size: parent.width * 0.8
            stroke: 3
            color: check.inverted ? check.under : Look.color("current-ink")
        }
    }
}
