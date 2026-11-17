import QtQuick 2.4

Item {
    id: passes
    default property alias content: body.data
    readonly property Item contentItem: body
    readonly property Item back: backPlane
    readonly property Item front: frontPlane
    readonly property Item attach: attachPlane
    readonly property Item lift: liftPlane

    Item { id: backPlane; z: 0 }
    Item {
        id: body
        z: 1
        anchors.fill: parent
        readonly property string layerRole: "scope"
        readonly property Item passes: passes
    }
    Item { id: frontPlane; z: 2 }
    Item { id: attachPlane; z: 3 }
    Item { id: liftPlane; z: 4 }
}
