import QtQuick 2.4

// LG's volume item as the part sees it: shown, at 13 of 100.
Item {
    property string part: "VolumeBar.qml"
    property Item lg: Item {
        property var audioService: QtObject { property int volume: 13; property int volumeMax: 100; property bool muted: false }
        property int volumeMaxLevel: 100
        state: "shown"
        states: State { name: "shown" }
    }
}
