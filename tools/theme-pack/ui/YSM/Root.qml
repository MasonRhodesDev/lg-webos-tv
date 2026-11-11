import QtQuick 2.4
import WebOSServices 1.0
import "file:///usr/lib/qt5/qml/YSM" as LG

// The compositor's root UI: LG's stock YSM with our layer on top. This module is found first on the compositor's
// import path, so nothing of LG's is edited. The layer is created separately, so if it fails to load, LG's UI still
// runs and the error is reported instead of blanking the screen.
LG.YSM {
    id: root

    property var reporter: Service { appId: "com.webos.surfacemanager.wedge" } // Look.busName
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
