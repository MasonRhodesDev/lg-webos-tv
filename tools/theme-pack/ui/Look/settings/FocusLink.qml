import QtQuick 2.4

// Our menus' place in LG's focus chain: request() pushes an item (with a `layerNumber`) and gives the top item
// focus, release() hands focus back to what was under it. Where LG's chain is missing (the preview harness), focus
// is taken directly and handed back to nothing. `chain` may be any component with the same two functions (tests).
QtObject {
    id: link
    property url chain: Qt.resolvedUrl("LgFocus.qml")
    property var handler: null
    readonly property bool shared: handler !== null

    Component.onCompleted: {
        var c = Qt.createComponent(chain);
        if (c.status === Component.Ready) handler = c.createObject(link);
    }
    function request(item) { if (handler) handler.request(item); else item.forceActiveFocus(); }
    function release(item) { if (handler) handler.release(item); }
}
