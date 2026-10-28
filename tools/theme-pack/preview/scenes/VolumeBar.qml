import QtQuick 2.4

// LG's volume item as the part sees it, shown, in each of the audio service's cases (Volume.qml reads volume,
// volumeMax, muted, disabled, scenario and cause).
Item {
    property string part: "VolumeBar.qml"
    property rect frame: Qt.rect(1280, 0, 640, 360)
    property Item lg: Item {
        property var audioService: QtObject {
            id: audio
            property int volume: 21
            property int volumeMax: 100
            property bool muted: false
            property bool disabled: false
            property string scenario: "mastervolume_tv_speaker"
            property string cause: "volumeUp"
        }
        property int volumeMaxLevel: 100
        state: "shown"
        states: State { name: "shown" }
    }
    states: [
        State { name: "speaker" },
        State { name: "full"; PropertyChanges { target: audio; volume: 100 } },
        State { name: "muted"; PropertyChanges { target: audio; volume: 40; muted: true } },
        State { name: "headphones"; PropertyChanges { target: audio; volume: 8; scenario: "mastervolume_headphone" } },
        State { name: "bluetooth"; PropertyChanges { target: audio; volume: 35; scenario: "mastervolume_ext_speaker_bt" } },
        State { name: "external-down"; PropertyChanges { target: audio; scenario: "mastervolume_ext_speaker_arc"; cause: "volumeDown" } },
        State { name: "disabled"; PropertyChanges { target: audio; disabled: true; scenario: "mastervolume_ext_speaker_optical" } }
    ]
}
