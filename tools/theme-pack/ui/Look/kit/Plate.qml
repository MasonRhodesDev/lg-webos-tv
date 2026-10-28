import QtQuick 2.4
import QtGraphicalEffects 1.0
import Look 1.0

// The one focus treatment (DESIGN.md, Focus): the plate under a row, tile or button. At rest it is `rest`; focused it
// fills with the focus colour (or the item's hue), gains the focus edge and a lift shadow; current adds the current
// bar along the bottom; disabled keeps the plate and dims the ink. Components read `ink` for their text and icons
// and scale themselves by focus-scale.
Item {
    id: plate
    property bool focused: false
    property bool current: false
    property bool disabled: false
    property int hue: -1
    property real radius: Look.px("r-row")
    property color rest: Look.color("inner")
    property bool edged: false
    readonly property bool inverted: focused && !disabled
    readonly property color fill: inverted ? Look.focusFill(hue) : rest
    readonly property color ink: disabled ? Look.color("ink-disabled") : inverted ? Look.color("focus-ink") : Look.color("ink")
    readonly property var lift: Look.shadow("elev-focus")
    anchors.fill: parent

    RectangularGlow {
        anchors.fill: parent
        anchors.topMargin: plate.lift.y + plate.lift.blur / 2
        anchors.bottomMargin: -plate.lift.y + plate.lift.blur / 2
        anchors.leftMargin: plate.lift.blur / 2
        anchors.rightMargin: plate.lift.blur / 2
        glowRadius: plate.lift.blur / 2
        spread: 0
        cornerRadius: Math.min(plate.radius + glowRadius, Math.min(width, height) / 2 + glowRadius)
        color: plate.lift.color
        opacity: plate.inverted ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }
    }
    Rectangle {
        anchors.fill: parent
        radius: plate.radius
        color: plate.fill
        border.width: plate.edged && !plate.focused ? Look.px("edge-w") : 0
        border.color: Look.color("surface-edge")
        Behavior on color { ColorAnimation { duration: Look.px("motion-focus") } }
    }
    Item {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: Look.px("current-w")
        clip: true
        visible: plate.current && !plate.focused
        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.bottom: parent.bottom
            height: plate.height
            radius: plate.radius
            color: Look.color("current")
        }
    }
    Rectangle {
        anchors.fill: parent
        radius: plate.radius
        color: "transparent"
        border.width: Look.px("focus-w")
        border.color: Look.color("focus-edge")
        opacity: plate.focused ? 1 : 0
        Behavior on opacity { NumberAnimation { duration: Look.px("motion-focus") } }
    }
}
