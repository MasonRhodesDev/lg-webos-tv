import QtQuick 2.4
import QtGraphicalEffects 1.0
import ".."

// The one material every panel, dialog, toast and key cap is made of: the style's surface with its edge, and the
// panel elevation under it. `strong` is the denser surface for things that sit over arbitrary content.
Item {
    id: surface
    property bool strong: false
    property bool elevated: true
    property real radius: Look.px("r-panel")
    readonly property var lift: Look.shadow("elev-panel")

    RectangularGlow {
        visible: surface.elevated && surface.lift.blur > 0
        anchors.fill: parent
        anchors.topMargin: surface.lift.y + surface.lift.blur / 2
        anchors.bottomMargin: -surface.lift.y + surface.lift.blur / 2
        anchors.leftMargin: surface.lift.blur / 2
        anchors.rightMargin: surface.lift.blur / 2
        glowRadius: surface.lift.blur / 2
        spread: 0
        cornerRadius: Math.min(surface.radius + glowRadius, Math.min(width, height) / 2 + glowRadius)
        color: surface.lift.color
    }
    Rectangle {
        anchors.fill: parent
        radius: surface.radius
        color: Look.color(surface.strong ? "surface-strong" : "surface")
        border.width: Look.px("edge-w")
        border.color: Look.color("surface-edge")
    }
}
