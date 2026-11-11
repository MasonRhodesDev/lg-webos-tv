import QtQuick 2.4
import ".."

// One choice of several: a ring, with a dot when chosen. Decoratable as `radio`.
Item {
    id: radio
    property bool checked: false
    property bool disabled: false
    property bool inverted: false
    readonly property color accent: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("current")
    width: Look.px("knob-size")
    height: width

    Decor {
        target: "radio"
        current: radio.checked
        disabled: radio.disabled
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: "transparent"
            border.width: Math.round(radio.width / 10)
            border.color: radio.checked ? radio.accent : radio.inverted ? Look.color("focus-ink") : radio.disabled ? Look.color("ink-disabled") : Look.color("ink-3")
        }
        Rectangle {
            anchors.centerIn: parent
            width: parent.width * 0.5
            height: width
            radius: width / 2
            color: radio.accent
            scale: radio.checked ? 1 : 0
            Behavior on scale { NumberAnimation { duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }
        }
    }
}
