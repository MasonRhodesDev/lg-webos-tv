import QtQuick 2.4
import Look 1.0

// The one tile anatomy (DESIGN.md, Tile): icon (or picture) at the top left, an optional badge at the top right, the
// name and a sub line at the bottom; an optional chip centred on the top-right corner. Badge and chip are
// attachments. Tiles float on the picture, so their plate is the surface. Decoratable as `tile`; focus is the one
// focus treatment (Plate).
Item {
    id: tile
    property string label
    property string sub
    property string icon
    property url image
    property int hue: -1
    property string badge
    property string badgeTone: "neutral"
    property string chip
    property string chipTone: "attention"
    property bool focused: false
    property bool current: false
    property bool disabled: false
    width: Look.px("tile-w")
    height: Look.px("tile-h")
    z: focused ? 2 : 0
    scale: focused ? Look.px("focus-scale") : 1
    Behavior on scale { NumberAnimation { duration: Look.px("motion-focus"); easing.type: Easing.Bezier; easing.bezierCurve: Look.curve("ease-focus") } }
    readonly property real pad: Look.px("tile-pad")

    Decor {
        target: "tile"
        focused: tile.focused
        current: tile.current
        disabled: tile.disabled
        anchors.fill: parent
        Plate {
            id: plate
            focused: tile.focused
            current: tile.current
            disabled: tile.disabled
            hue: tile.hue
            radius: Look.px("r-tile")
            rest: Look.color("surface")
            edged: true
        }
        Icon {
            visible: !!tile.icon && tile.image == ""
            x: tile.pad
            y: tile.pad
            size: Look.px("icon") * 1.4
            name: tile.icon
            color: tile.disabled || plate.inverted ? plate.ink : tile.hue >= 0 ? Look.hue(tile.hue) : Look.color("ink")
        }
        Image {
            visible: tile.image != ""
            x: tile.pad
            y: tile.pad
            width: Look.px("icon") * 1.4
            height: width
            source: tile.image
            fillMode: Image.PreserveAspectFit
            opacity: tile.disabled ? 0.5 : 1
            smooth: true
        }
        Column {
            x: tile.pad
            width: tile.width - 2 * tile.pad
            anchors.bottom: parent.bottom
            anchors.bottomMargin: tile.pad - (tile.current && !tile.focused ? 0 : 2)
            Label { role: "tile"; text: tile.label; color: plate.ink; width: parent.width }
            Label { visible: !!tile.sub; role: "caption"; text: tile.sub; color: plate.ink; opacity: tile.disabled ? 1 : 0.85; width: parent.width }
        }

        // Attachments paint after every +1 in the passes, so no theme covers them. The chip is centred on the
        // top-right corner (board 4, Attention).
        attachments: [
            Badge {
                visible: !!tile.badge
                text: tile.badge
                tone: tile.badgeTone
                anchors.right: parent.right
                anchors.rightMargin: tile.pad - 4
                y: tile.pad - 2
            },
            Chip {
                visible: !!tile.chip
                text: tile.chip
                tone: tile.chipTone
                anchor: [100, 0]
            }
        ]
    }
}
