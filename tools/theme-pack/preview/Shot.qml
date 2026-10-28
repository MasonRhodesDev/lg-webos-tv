import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0

// Renders one part at 1920x1080 over a stand-in picture and saves it: qml Shot.qml -- SCENE.qml PAYLOAD_JSON OUT.png
Window {
    id: win
    width: 1920; height: 1080
    visible: true
    color: "#000000"

    readonly property var args: Qt.application.arguments.slice(Qt.application.arguments.indexOf("--") + 1)

    Image { anchors.fill: parent; source: Qt.resolvedUrl("backdrop.png"); fillMode: Image.PreserveAspectCrop }
    Item { id: stage; anchors.fill: parent }

    Component.onCompleted: {
        Fixture.load(args[1]);
        var scene = Qt.createComponent(Qt.resolvedUrl(args[0])).createObject(win);
        var c = Qt.createComponent(Qt.resolvedUrl("../ui/Look/parts/" + scene.part));
        if (c.status === Component.Error) { console.error(c.errorString()); Qt.exit(1); return; }
        var part = c.createObject(stage);
        part.lg = scene.lg;
        shoot.start();
    }
    // A scene that throws never reaches the shot; give up rather than hang.
    Timer { interval: 10000; running: true; onTriggered: { console.error("no shot after 10 s"); Qt.exit(1); } }
    Timer {
        id: shoot
        interval: 600
        onTriggered: win.contentItem.grabToImage(function (r) { r.saveToFile(win.args[2]); Qt.quit(); })
    }
}
