import QtQuick 2.4
import QtGraphicalEffects 1.0
import Look 1.0

// One theme recipe drawn around a component: an image from the theme's asset pack, or a soft fill (a glow).
// The outset is [top, right, bottom, left] in px out from the component, or one number for all four.
Item {
    id: ring
    property Item host
    property string theme
    property var recipe

    readonly property var o: typeof recipe.outset === "number" ? [recipe.outset, recipe.outset, recipe.outset, recipe.outset]
                                                               : (recipe.outset || [0, 0, 0, 0])
    x: -o[3]
    y: -o[0]
    width: host.width + o[1] + o[3]
    height: host.height + o[0] + o[2]
    visible: { var w = recipe.when || "always"; return w === "always" || host[w] === true; }
    opacity: recipe.opacity !== undefined ? recipe.opacity : 1

    Image {
        visible: !!ring.recipe.asset
        anchors.fill: parent
        source: ring.recipe.asset && Look.assets ? Look.assets + ring.theme + "/" + ring.recipe.asset : ""
        fillMode: Image.PreserveAspectFit
        smooth: true
        mipmap: true
    }

    // RectangularGlow spreads its blur outside its own box, so the box is inset by the blur to stay inside the ring.
    RectangularGlow {
        visible: !!ring.recipe.fill
        anchors.fill: parent
        anchors.margins: ring.recipe.blur || 0
        glowRadius: ring.recipe.blur || 0
        spread: 0.2
        cornerRadius: ring.recipe.radius || 0
        color: ring.recipe.fill ? Look.fill(ring.recipe.fill) : "transparent"
    }
}
