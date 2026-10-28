import QtQuick 2.4
import Look 1.0
import "passes.js" as Passes

// One component in the layer model (DESIGN.md, Layers): theme rings behind (−1), the component as the style draws it
// (the origin, given as this item's children), theme rings in front (+1), and its attachments (`attachments`: chips,
// badges, counts), which paint after its +1. Meaning lives in the origin and the attachments, so turning themes off
// never hides a value or a state.
//
// Inside a Passes container its layers join that container's planes, so siblings paint in passes and the focused one
// lifts its whole stack above them. Outside one, or inside another component's origin, they stay here in that order.
// An attachment with an `anchor` ([x%, y%] of the origin) is centred on that point.
Item {
    id: decor
    property string target
    property bool focused: false
    property bool current: false
    property bool disabled: false
    // Whether the theme layers show at all, and how strongly (the screen's follow whether a surface is open).
    property real decorated: 1
    default property alias origin: originItem.data
    property alias attachments: attachLayer.data

    readonly property Item scope: Passes.scopeOf(decor)
    readonly property bool lifted: scope !== null && focused
    readonly property var place: scope ? Passes.place(decor, scope.contentItem) : Passes.HOME
    // Its layers, for tests and tools that check paint order.
    readonly property var layers: ({ "back": backLayer, "origin": originItem, "front": frontLayer, "attach": attachLayer, "lift": liftGroup })

    DecorLayer {
        id: backLayer
        decor: decor
        z: 1
        home: decor.scope === null
        parent: decor.lifted ? liftGroup : decor.scope ? decor.scope.back : decor
        Item {
            anchors.fill: parent
            visible: decor.decorated > 0
            opacity: decor.decorated
            Repeater {
                model: Look.rings(decor.target, "back")
                Ring { host: decor; theme: modelData.theme; recipe: modelData.recipe }
            }
        }
    }
    DecorLayer {
        id: originItem
        decor: decor
        z: 2
        layerRole: "origin"
        home: !decor.lifted
        parent: decor.lifted ? liftGroup : decor
    }
    DecorLayer {
        id: frontLayer
        decor: decor
        z: 3
        home: decor.scope === null
        parent: decor.lifted ? liftGroup : decor.scope ? decor.scope.front : decor
        Item {
            anchors.fill: parent
            visible: decor.decorated > 0
            opacity: decor.decorated
            Repeater {
                model: Look.rings(decor.target, "front")
                Ring { host: decor; theme: modelData.theme; recipe: modelData.recipe }
            }
        }
    }
    DecorLayer {
        id: attachLayer
        decor: decor
        z: 4
        layerRole: "attach"
        home: decor.scope === null
        parent: decor.lifted ? liftGroup : decor.scope ? decor.scope.attach : decor
        onChildrenChanged: decor.pin()
    }
    // The focused component's whole stack, in the scope's last plane.
    Item {
        id: liftGroup
        parent: decor.lifted ? decor.scope.lift : decor
        visible: decor.lifted
    }

    function pin() {
        var kids = attachLayer.children;
        for (var i = 0; i < kids.length; i++) {
            if (!kids[i].anchor) continue;
            (function (a) {
                a.x = Qt.binding(function () { return attachLayer.width * a.anchor[0] / 100 - a.width / 2; });
                a.y = Qt.binding(function () { return attachLayer.height * a.anchor[1] / 100 - a.height / 2; });
            })(kids[i]);
        }
    }
}
