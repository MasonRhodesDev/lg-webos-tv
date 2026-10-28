import QtQuick 2.4
import Look 1.0

// Our volume bar. LG's Volume item keeps all of its logic (when to show, timeouts, the volume OSD setting, audio
// guidance); this only draws. It shows while LG's item is shown and reads the same audio service.
Item {
    id: bar
    property Item lg: null
    function claims(item) { return item.audioService !== undefined && item.volumeMaxLevel !== undefined; }
    readonly property var audio: lg ? lg.audioService : null
    readonly property int level: audio ? audio.volume : 0
    readonly property bool muted: audio ? audio.muted : false
    readonly property real fraction: audio && audio.volumeMax > 0 ? Math.max(0, Math.min(1, audio.volume / audio.volumeMax)) : 0
    readonly property bool shown: lg !== null && lg.visible && lg.state !== "hidden"

    width: 112
    height: 560
    anchors.right: parent.right
    anchors.rightMargin: 64
    anchors.verticalCenter: parent.verticalCenter
    opacity: shown ? 1 : 0
    visible: opacity > 0
    Behavior on opacity { NumberAnimation { duration: 160 } }

    Decor {
        target: "panel"
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: Look.px("r-panel")
            color: Look.color("surface")
            border.width: 2
            border.color: Look.color("surface-edge")
        }
    }

    Text {
        id: number
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top
        anchors.topMargin: 28
        text: bar.muted ? "—" : String(bar.level)
        color: Look.color("ink")
        font.family: Look.font
        font.pixelSize: 40
        font.weight: Font.DemiBold
    }

    Item {
        id: track
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: number.bottom
        anchors.topMargin: 40
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 52
        width: 12

        Rectangle { anchors.fill: parent; radius: width / 2; color: Look.color("track") }
        Rectangle {
            anchors.bottom: parent.bottom
            width: parent.width
            height: parent.height * bar.fraction
            radius: width / 2
            color: bar.muted ? Look.color("ink-disabled") : Look.color("ink")
        }
        Decor {
            target: "thumb"
            width: 30
            height: 30
            x: (track.width - width) / 2
            y: track.height * (1 - bar.fraction) - height / 2
            Rectangle { anchors.fill: parent; radius: width / 2; color: Look.color("ink") }
        }
    }
}
