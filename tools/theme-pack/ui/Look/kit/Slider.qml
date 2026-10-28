import QtQuick 2.4
import Look 1.0

// A level: track, fill and thumb (decoratable as `thumb`). Horizontal, or vertical filling upwards (the volume
// rail). `fraction` is 0..1; changes glide with the value motion.
Item {
    id: slider
    property real fraction: 0
    property bool vertical: false
    property bool disabled: false
    property bool inverted: false
    property bool muted: false
    property real length: 280

    readonly property real t: Look.px("thumb")
    readonly property real th: Look.px("track-h")
    property real shown: Math.max(0, Math.min(1, fraction))
    Behavior on shown { NumberAnimation { duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }
    readonly property color fillColor: disabled || muted ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("ink")

    width: vertical ? t : length
    height: vertical ? length : t

    Item {
        id: track
        x: slider.vertical ? (slider.width - width) / 2 : 0
        y: slider.vertical ? 0 : (slider.height - height) / 2
        width: slider.vertical ? slider.th : slider.width
        height: slider.vertical ? slider.height : slider.th
        Rectangle {
            anchors.fill: parent
            radius: slider.th / 2
            color: slider.inverted ? Qt.rgba(0, 0, 0, 0.22) : Look.color("track")
        }
        Rectangle {
            x: 0
            y: slider.vertical ? parent.height * (1 - slider.shown) : 0
            width: slider.vertical ? parent.width : parent.width * slider.shown
            height: slider.vertical ? parent.height * slider.shown : parent.height
            radius: slider.th / 2
            color: slider.fillColor
        }
    }
    Decor {
        target: "thumb"
        disabled: slider.disabled
        width: slider.t
        height: slider.t
        x: slider.vertical ? 0 : slider.width * slider.shown - width / 2
        y: slider.vertical ? slider.height * (1 - slider.shown) - height / 2 : 0
        Rectangle {
            anchors.fill: parent
            radius: width / 2
            color: slider.disabled ? Look.color("ink-disabled") : "#ffffff"
            border.width: slider.inverted ? 3 : 0
            border.color: Look.color("focus-ink")
        }
    }
}
