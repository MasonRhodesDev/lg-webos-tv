import QtQuick 2.4
import Look 1.0

// Our volume bar: the pill at the top right of the SmokeOverlays board, the speaker, the level and its number. LG's
// Volume item keeps all of its logic (when to show, timeouts, the volume OSD setting, audio guidance); this only draws
// what it shows. LG's item has no pointer areas.
//   TV speaker, headphones, Bluetooth, WiSA   icon, level and number (Bluetooth: no number, LG knows no exact level)
//   muted                                    the mute icon, the level dimmed
//   external speaker (optical, ARC, line out) no level: the speaker and which way the remote just turned it
//   disabled                                 the TV cannot set this device's volume
Item {
    id: bar
    property Item lg: null
    function claims(item) { return item.audioService !== undefined && item.volumeMaxLevel !== undefined; }
    readonly property var audio: lg ? lg.audioService : null
    readonly property int level: audio ? audio.volume : 0
    readonly property bool muted: audio ? !!audio.muted : false
    readonly property bool disabled: audio ? !!audio.disabled : false
    readonly property string scenario: audio && audio.scenario ? audio.scenario : ""
    readonly property string cause: audio && audio.cause ? audio.cause : ""
    readonly property real fraction: audio && audio.volumeMax > 0 ? Math.max(0, Math.min(1, audio.volume / audio.volumeMax)) : 0
    readonly property bool shown: lg !== null && lg.visible && lg.state !== "hidden"

    // LG's own grouping of scenarios (Volume.qml): these report no level, only up or down.
    readonly property bool exterior: ["mastervolume_ext_speaker_optical", "mastervolume_ext_speaker_arc", "mastervolume_lineout",
                                      "mastervolume_ext_speaker_urcu_oss"].indexOf(scenario) >= 0
    readonly property bool bluetooth: scenario === "mastervolume_ext_speaker_bt"
    readonly property bool hasLevel: !exterior && !disabled
    readonly property string icon: disabled ? "noVolume" : muted ? "mute" : exterior ? "soundbar"
                                 : scenario === "mastervolume_headphone" ? "headphones" : bluetooth ? "bluetooth" : "volume"

    anchors.fill: parent

    Panel {
        id: pill
        placement: "bar"
        shown: bar.shown
        padding: Look.px("space-lx")
        radius: height / 2
        // Without a level the pill holds only its icons.
        width: bar.hasLevel ? implicitWidth : 2 * padding + body.childrenRect.width

        Row {
            height: parent.height
            spacing: Look.px("space-ml")
            Icon {
                id: speaker
                name: bar.icon
                color: bar.disabled ? Look.color("ink-disabled") : Look.color("ink")
                anchors.verticalCenter: parent.verticalCenter
            }
            Slider {
                visible: bar.hasLevel
                muted: bar.muted
                fraction: bar.fraction
                length: pill.width - 2 * pill.padding - speaker.width - parent.spacing
                        - (number.visible ? number.width + parent.spacing : 0)
                anchors.verticalCenter: parent.verticalCenter
            }
            Label {
                id: number
                visible: bar.hasLevel && !bar.bluetooth
                role: "numeral"
                text: String(bar.level)
                color: bar.muted ? Look.color("ink-disabled") : Look.color("ink")
                // The board's slot fits two digits; 100 widens it rather than elides.
                width: Math.max(Look.px("type-numeral") * 1.4, implicitWidth)
                horizontalAlignment: Text.AlignRight
                anchors.verticalCenter: parent.verticalCenter
            }
            Icon {
                visible: bar.exterior && !bar.disabled && (bar.cause === "volumeUp" || bar.cause === "volumeDown")
                name: bar.cause === "volumeUp" ? "up" : "down"
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
}
