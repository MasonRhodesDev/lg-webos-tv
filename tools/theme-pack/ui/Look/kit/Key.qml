import QtQuick 2.4
import ".."

// One key cap of an on-screen keyboard or keypad (the Keyboard and PIN prompt boards): an edged `inner` plate, radius
// `r-key`, its name in `role` (cap, cap-word or pad). Focus is the one focus treatment (Plate); `current` marks the
// key that finishes (Done) with the current bar. Decoratable as `button`. A pointer click emits clicked().
Item {
    id: key
    property string label
    property string icon
    property string role: "cap"
    property bool focused: false
    property bool current: false
    property bool disabled: false
    property bool pointer: true
    signal clicked()
    width: Look.px("key-w")
    height: Look.px("key-h")
    z: focused ? 2 : 0
    scale: focused ? Look.px("focus-scale") : 1
    Behavior on scale { NumberAnimation { duration: Look.px("motion-focus"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }

    Decor {
        target: "button"
        focused: key.focused
        disabled: key.disabled
        anchors.fill: parent
        Plate {
            id: plate
            focused: key.focused
            current: key.current
            disabled: key.disabled
            radius: Look.px("r-key")
            edged: true
        }
        Icon {
            visible: !!key.icon
            anchors.centerIn: parent
            name: key.icon
            color: plate.ink
        }
        Label {
            visible: !key.icon
            anchors.centerIn: parent
            role: key.role
            text: key.label
            color: plate.ink
        }
    }
    MouseArea {
        anchors.fill: parent
        enabled: key.pointer && !key.disabled
        onClicked: key.clicked()
    }
}
