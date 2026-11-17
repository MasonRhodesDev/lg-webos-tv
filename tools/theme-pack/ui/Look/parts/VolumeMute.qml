import QtQuick 2.4
import ".."

Item {
    id: mute
    property Item lg: null
    function claims(item) { return item.setState !== undefined && item.moveDirection !== undefined && item.circleOpacity !== undefined; }
    readonly property bool shown: lg !== null && lg.state === "shown" && (!lg.parent || lg.parent.visible)
    readonly property var probe: ({ "shown": shown })

    anchors.fill: parent

    Panel {
        placement: "bar"
        shown: mute.shown
        padding: 0
        width: height
        radius: height / 2
        Icon {
            name: "mute"
            anchors.centerIn: parent
        }
    }
}
