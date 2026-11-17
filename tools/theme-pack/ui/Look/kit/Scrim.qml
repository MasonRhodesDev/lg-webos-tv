import QtQuick 2.4
import ".."

Item {
    id: scrim
    property string kind: "dim"
    property bool shown: true
    property real extent: kind === "bottom" ? 480 : 900
    anchors.fill: parent

    Item {
        anchors.fill: parent
        opacity: scrim.shown ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: Look.px(scrim.shown ? "motion-enter" : "motion-exit") } }

        Rectangle {
            visible: scrim.kind === "dim"
            anchors.fill: parent
            color: Look.color("dim")
        }
        Rectangle {
            visible: scrim.kind === "bottom"
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: scrim.extent
            gradient: Gradient {
                GradientStop { position: 0; color: "transparent" }
                GradientStop { position: 1 / 3; color: Look.color("scrim") }
                GradientStop { position: 1; color: Look.color("scrim") }
            }
        }
        Item {
            visible: scrim.kind === "left" || scrim.kind === "right"
            width: scrim.extent
            height: parent.height
            x: scrim.kind === "right" ? parent.width - width : 0
            Rectangle {
                anchors.centerIn: parent
                width: parent.height
                height: parent.width
                rotation: scrim.kind === "left" ? -90 : 90
                gradient: Gradient {
                    GradientStop { position: 0; color: "transparent" }
                    GradientStop { position: 1; color: Look.color("scrim") }
                }
            }
        }
    }
}
