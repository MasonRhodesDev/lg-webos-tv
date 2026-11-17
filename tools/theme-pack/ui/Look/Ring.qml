import QtQuick 2.4
import QtGraphicalEffects 1.0
import "."
import "place.js" as Place

Item {
    id: ring
    property Item host
    property string theme
    property var recipe

    readonly property var want: Place.outset(recipe.outset, host.focused, host.current, host.disabled)
    property real ot: want[0]
    property real or: want[1]
    property real ob: want[2]
    property real ol: want[3]
    Behavior on ot { NumberAnimation { duration: Look.px("motion-focus") } }
    Behavior on or { NumberAnimation { duration: Look.px("motion-focus") } }
    Behavior on ob { NumberAnimation { duration: Look.px("motion-focus") } }
    Behavior on ol { NumberAnimation { duration: Look.px("motion-focus") } }
    readonly property var o: [ot, or, ob, ol]
    readonly property real radius: typeof recipe.radius === "string" ? Look.px(recipe.radius) + o[0] : (recipe.radius || 0)
    readonly property var box: Place.rect(Place.placement(recipe.style), host.width + o[1] + o[3], host.height + o[0] + o[2])
    x: -o[3] + box.x
    y: -o[0] + box.y
    width: box.width
    height: box.height
    visible: { var w = recipe.when || "always"; return w === "always" || host[w] === true; }
    opacity: (recipe.opacity !== undefined ? recipe.opacity : 1) * (host.disabled ? 0.5 : 1)

    property bool wanted: false
    onVisibleChanged: if (visible) wanted = true
    Component.onCompleted: wanted = visible

    Loader {
        active: ring.wanted && !!ring.recipe.asset
        anchors.fill: parent
        sourceComponent: Image {
            source: ring.recipe.asset && Look.assets ? Look.assets + ring.theme + "/" + ring.recipe.asset : ""
            fillMode: Image.PreserveAspectFit
            smooth: true
            mipmap: true
        }
    }

    Loader {
        active: ring.wanted && !!ring.recipe.fill
        anchors.fill: parent
        anchors.margins: ring.recipe.blur || 0
        sourceComponent: RectangularGlow {
            glowRadius: ring.recipe.blur || 0
            spread: 0.2
            cornerRadius: ring.radius
            color: ring.recipe.fill ? Look.fill(ring.recipe.fill) : "transparent"
        }
    }

    Loader {
        active: ring.wanted && !!ring.recipe.stroke
        anchors.fill: parent
        sourceComponent: Rectangle {
            color: "transparent"
            border.width: ring.recipe.strokeWidth || 1
            border.color: ring.recipe.stroke ? Look.fill(ring.recipe.stroke) : "transparent"
            radius: Math.min(ring.radius, width / 2, height / 2)
        }
    }
}
