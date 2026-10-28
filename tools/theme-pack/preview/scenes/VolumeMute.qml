import QtQuick 2.4

// LG's VolumeMute (a child of the Volume item) as the part sees it: shown while the sound stays muted.
Item {
    property string part: "VolumeMute.qml"
    property rect frame: Qt.rect(1440, 0, 480, 270)
    property Item lg: Item {
        id: lgMute
        property string moveDirection: "down"
        property real circleOpacity: 0.6
        function setState(s) { state = s; }
        state: "shown"
        states: [State { name: "shown" }, State { name: "hidden" }]
    }
    states: [
        State { name: "shown" },
        State { name: "hidden"; PropertyChanges { target: lgMute; state: "hidden" } }
    ]
}
