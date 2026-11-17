import QtQuick 2.4
import ".."

Item {
    id: badge
    property string text
    property string tone: "neutral"
    property var anchor: null
    readonly property string fillToken: tone === "neutral" ? "ink" : tone
    readonly property string inkToken: tone === "neutral" ? "focus-ink" : tone === "current" ? "current-ink" : tone + "-ink"
    height: Look.px("type-caption") + 2 * Look.px("space-xs")
    width: label.implicitWidth + 2 * Look.px("space-s")

    Decor {
        target: "badge"
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: Look.color(badge.fillToken)
        }
        Label {
            id: label
            anchors.centerIn: parent
            role: "caption"
            font.weight: Font.DemiBold
            text: badge.text
            color: Look.color(badge.inkToken)
        }
    }
}
