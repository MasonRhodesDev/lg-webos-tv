import QtQuick 2.4
import "."
import "passes.js" as Passes

Item {
    id: decor
    property string target
    property bool focused: false
    property bool current: false
    property bool disabled: false
    property real decorated: 1
    default property alias origin: originItem.data
    property alias attachments: attachLayer.data

    readonly property Item scope: Passes.scopeOf(decor)
    readonly property bool lifted: scope !== null && focused
    readonly property var place: scope ? Passes.place(decor, scope.contentItem) : Passes.HOME
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
