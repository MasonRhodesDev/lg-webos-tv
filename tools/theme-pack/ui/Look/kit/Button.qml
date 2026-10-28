import QtQuick 2.4
import Look 1.0

// A pill button, decoratable as `button`. Focus is the one focus treatment (Plate). A pointer click emits clicked().
Item {
    id: button
    property string label
    property string icon
    property bool focused: false
    property bool disabled: false
    property int hue: -1
    signal clicked()
    height: Look.px("button-h")
    // With only an icon, a round button as wide as it is tall.
    width: label ? content.width + 2 * Look.px("space-xl") : height
    z: focused ? 2 : 0
    scale: focused ? Look.px("focus-scale") : 1
    Behavior on scale { NumberAnimation { duration: Look.px("motion-focus"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }

    Decor {
        target: "button"
        focused: button.focused
        disabled: button.disabled
        anchors.fill: parent
        Plate {
            id: plate
            focused: button.focused
            disabled: button.disabled
            hue: button.hue
            radius: Math.min(Look.px("r-control"), button.height / 2)
            edged: true
        }
        Row {
            id: content
            anchors.centerIn: parent
            spacing: Look.px("space-s")
            Icon { visible: !!button.icon; name: button.icon; color: plate.ink; anchors.verticalCenter: parent.verticalCenter }
            Label { role: "label"; text: button.label; color: plate.ink; anchors.verticalCenter: parent.verticalCenter }
        }
    }
    MouseArea {
        anchors.fill: parent
        enabled: !button.disabled
        onClicked: button.clicked()
    }
}
