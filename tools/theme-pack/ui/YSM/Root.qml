import QtQuick 2.4
import WebOSServices 1.0
import "file:///usr/lib/qt5/qml/YSM" as LG

LG.YSM {
    id: root

    property var reporter: Service { appId: "com.webos.surfacemanager.wedge" }
    function report(kind, text) {
        reporter.call("luna://dev.themepack.look.service", "/report",
                      JSON.stringify({ "from": "ui", "kind": kind, "text": text }));
    }

    Component.onCompleted: {
        report("root", "own layer root loaded");
        var c = Qt.createComponent(Qt.resolvedUrl("../Look/Layer.qml"));
        if (c.status === Component.Error) { report("error", c.errorString()); return; }
        var layer = c.createObject(root, { "host": root });
        report(layer ? "ready" : "error", layer ? "layer created" : "layer could not be created");
    }
}
