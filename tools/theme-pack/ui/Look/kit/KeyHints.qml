import QtQuick 2.4
import Look 1.0

// The remote keys a surface answers to, along its foot: [{ key: "OK" | "BACK" | "up" ..., keys: ["up", "down"],
// label: "Move" }]. Arrow keys draw as arrows; any other key is its name on the cap.
Row {
    id: hints
    property var hints: []
    spacing: Look.px("space-xl")
    readonly property var arrows: ({ "up": "M6 15l6-6 6 6", "down": "M6 9l6 6 6-6", "left": "M15 6l-6 6 6 6", "right": "M9 6l6 6-6 6" })

    Repeater {
        model: hints.hints
        Row {
            readonly property var keys: modelData.keys || [modelData.key]
            readonly property bool drawn: hints.arrows[keys[0]] !== undefined
            spacing: Look.px("space-s")
            Item {
                width: Math.max(height, (drawn ? keyIcons.width : keyName.implicitWidth) + 2 * Look.px("space-s"))
                height: Look.px("type-key") + 2 * Look.px("space-xs")
                anchors.verticalCenter: parent.verticalCenter
                Surface { anchors.fill: parent; elevated: false; radius: height / 2 }
                Label { id: keyName; visible: !drawn; anchors.centerIn: parent; role: "key"; text: keys.join(" ") }
                Row {
                    id: keyIcons
                    visible: drawn
                    anchors.centerIn: parent
                    Repeater {
                        model: drawn ? keys : []
                        Icon { name: hints.arrows[modelData] || ""; size: Look.px("type-key") * 1.2; stroke: 3 }
                    }
                }
            }
            Label { role: "value"; text: modelData.label; color: Look.color("ink-2"); anchors.verticalCenter: parent.verticalCenter }
        }
    }
}
