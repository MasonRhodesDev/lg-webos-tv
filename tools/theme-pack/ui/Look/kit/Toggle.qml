import QtQuick 2.4
import ".."

// An on/off switch: a track and a knob. On is the current colour; the knob is decoratable (`knob`).
// `inverted` is set when it sits on a focus fill.
Item {
    id: toggle
    property bool on: false
    property bool disabled: false
    property bool inverted: false
    width: Look.px("toggle-w")
    height: Look.px("toggle-h")
    readonly property real k: Look.px("knob-size")
    readonly property real inset: (height - k) / 2

    Rectangle {
        anchors.fill: parent
        radius: height / 2
        opacity: toggle.disabled ? 0.5 : 1
        color: !toggle.on ? Look.color("track") : toggle.inverted ? Look.color("focus-ink") : Look.color("current")
        Behavior on color { ColorAnimation { duration: Look.px("motion-value") } }
    }
    Decor {
        target: "knob"
        disabled: toggle.disabled
        width: toggle.k
        height: toggle.k
        y: toggle.inset
        x: toggle.on ? toggle.width - toggle.inset - width : toggle.inset
        Behavior on x { NumberAnimation { duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }
        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: toggle.on && !toggle.inverted ? Look.color("current-ink") : "#ffffff"
            opacity: toggle.disabled ? 0.6 : 1
        }
    }
}
