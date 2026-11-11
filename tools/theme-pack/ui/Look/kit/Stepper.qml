import QtQuick 2.4
import ".."

// An inline value picker: ‹ value › with a dot per option under it, as Quick Settings steps through modes with Left
// and Right. Wraps at the ends. step(+1 / -1) moves; the value slides in from the side it came from.
Item {
    id: stepper
    property var options: []
    property int index: 0
    property bool disabled: false
    property bool inverted: false
    property real valueWidth: 220
    readonly property string text: options && options.length ? String(options[Math.max(0, Math.min(options.length - 1, index))]) : ""
    readonly property color ink: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("ink")
    readonly property int count: options ? options.length : 0
    signal stepped(int index)

    function step(d) {
        if (disabled || count < 2) return;
        dir = d;
        stepped((index + d + count) % count);
    }
    property int dir: 1
    onIndexChanged: { slide.stop(); slide.start(); }

    width: chevL.width + valueWidth + chevR.width
    height: Look.px("toggle-h") + 14

    Icon { id: chevL; name: "back"; size: Look.px("icon") * 0.8; color: stepper.ink; opacity: 0.75; anchors.verticalCenter: valueBox.verticalCenter }
    Item {
        id: valueBox
        x: chevL.width
        width: stepper.valueWidth
        height: Look.px("toggle-h")
        clip: true
        Label {
            id: value
            role: "value"
            width: parent.width
            anchors.verticalCenter: parent.verticalCenter
            horizontalAlignment: Text.AlignHCenter
            text: stepper.text
            color: stepper.ink
        }
    }
    Icon { id: chevR; name: "drill"; size: chevL.size; x: valueBox.x + valueBox.width; color: stepper.ink; opacity: 0.75; anchors.verticalCenter: valueBox.verticalCenter }
    Row {
        visible: stepper.count > 1 && stepper.count <= 9
        anchors.horizontalCenter: valueBox.horizontalCenter
        anchors.bottom: parent.bottom
        spacing: 8
        Repeater {
            model: stepper.count
            Rectangle {
                width: 8
                height: 8
                radius: 4
                color: stepper.ink
                opacity: index === stepper.index ? 1 : 0.35
            }
        }
    }
    ParallelAnimation {
        id: slide
        NumberAnimation { target: value; property: "x"; from: 24 * stepper.dir; to: 0; duration: Look.px("motion-value"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") }
        NumberAnimation { target: value; property: "opacity"; from: 0; to: 1; duration: Look.px("motion-value") }
    }
}
