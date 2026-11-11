import QtQuick 2.4
import ".."

// A count or alert dot pinned to a corner of a tile or icon ("2", "!"). Decoratable as `chip`.
// tone: attention (default), critical, neutral.
Item {
    id: chip
    property string text
    property string tone: "attention"
    // As an attachment: the point of the origin it is centred on, [x%, y%] (Decor).
    property var anchor: [100, 0]
    readonly property string fillToken: tone === "critical" ? "critical" : tone === "neutral" ? "ink" : "attention"
    readonly property string inkToken: tone === "critical" ? "critical-ink" : tone === "neutral" ? "focus-ink" : "attention-ink"
    height: Look.px("type-label") + 2 * Look.px("space-s")
    width: Math.max(height, label.implicitWidth + 2 * Look.px("space-s"))

    Decor {
        target: "chip"
        anchors.fill: parent
        Rectangle {
            anchors.fill: parent
            radius: height / 2
            color: Look.color(chip.fillToken)
        }
        Label {
            id: label
            anchors.centerIn: parent
            role: "label"
            font.weight: Font.Bold
            text: chip.text
            color: Look.color(chip.inkToken)
        }
    }
}
