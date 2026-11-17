import QtQuick 2.4
import ".."

Rectangle {
    id: well
    property string icon
    property int hue: -1
    readonly property color tone: hue >= 0 ? Look.hue(hue) : Look.color("ink")
    width: Look.px("well")
    height: width
    radius: width / 2
    color: Qt.rgba(tone.r, tone.g, tone.b, 0.18)
    border.width: Look.px("edge-w")
    border.color: tone
    Icon {
        anchors.centerIn: parent
        name: well.icon
        size: Look.px("icon") * 1.15
        color: well.tone
    }
}
