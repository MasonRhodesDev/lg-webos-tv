import QtQuick 2.4

// One of a component's layers (−1, 0, +1, attachments). At home it lies over its Decor; joined to passes it sits in
// one of the scope's planes, where it follows the Decor's box (passes.js place()).
Item {
    property Item decor
    property bool home: true
    property string layerRole
    readonly property var at: decor.place
    x: home ? 0 : at.x
    y: home ? 0 : at.y
    width: decor.width
    height: decor.height
    opacity: home ? 1 : at.opacity
    visible: home || decor.visible
    scale: home ? 1 : at.scale
    transformOrigin: Item.TopLeft
}
