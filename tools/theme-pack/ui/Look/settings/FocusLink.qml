import QtQuick 2.4

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
