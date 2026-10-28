import QtQuick 2.4
import Look 1.0

// The mute indicator: after the volume bar goes, LG keeps a small mute sign up while the sound stays muted (on
// speakers other than the TV's, and in some countries). It is LG's VolumeMute, a child of the Volume item, so hiding
// the volume hides it too; this draws it where the volume bar was, as a round pill with the mute icon.
Item {
    id: mute
    property Item lg: null
    function claims(item) { return item.setState !== undefined && item.moveDirection !== undefined && item.circleOpacity !== undefined; }
    readonly property bool shown: lg !== null && lg.state === "shown" && (!lg.parent || lg.parent.visible)

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
