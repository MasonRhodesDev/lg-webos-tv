import QtQuick 2.4

// LG's volume item as the part sees it, shown: low, full, or muted.
Item {
    property string part: "VolumeBar.qml"
    property rect frame: Qt.rect(1520, 200, 400, 680)
    property Item lg: Item {
        property var audioService: QtObject { id: audio; property int volume: 13; property int volumeMax: 100; property bool muted: false }
        property int volumeMaxLevel: 100
        state: "shown"
        states: State { name: "shown" }
    }
    states: [
        State { name: "low" },
        State { name: "full"; PropertyChanges { target: audio; volume: 100 } },
        State { name: "muted"; PropertyChanges { target: audio; volume: 40; muted: true } }
    ]
}
