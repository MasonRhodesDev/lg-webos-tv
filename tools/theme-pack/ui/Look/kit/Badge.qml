import QtQuick 2.4
import Look 1.0

// A short text tag on a tile or row ("Watching", "New", "4K"). Decoratable as `badge`.
// tone: neutral (default), current, attention, critical.
Item {
    id: badge
    property string text
    property string tone: "neutral"
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
            font.weight: Font.Bold
            text: badge.text
            color: Look.color(badge.inkToken)
        }
    }
}
