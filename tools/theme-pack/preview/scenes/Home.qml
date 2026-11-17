import QtQuick 2.4
import Preview 1.0

Item {
    id: scene
    property rect frame: Qt.rect(0, 600, 1920, 480)
    readonly property var p: loader.item
    Loader { id: loader; anchors.fill: parent; source: Qt.resolvedUrl("../../ui/Look/parts/Home.qml") }

    function focusOn(label) {
        var t = p.tiles;
        for (var i = 0; i < t.length; i++) if (t[i].label === label) { p.ribbon.currentIndex = i; return; }
    }

    Component.onCompleted: p.show()
    states: [
        State { name: "app"; StateChangeScript { script: { p.show(); scene.focusOn("Radio"); } } },
        State { name: "usb"; StateChangeScript { script: {
            TvSettings.storage = TvSettings.storage.concat([{ "deviceId": "USB_1", "deviceUri": "/tmp/usb/sda1", "deviceType": "usb", "deviceName": "Holiday photos" }]);
            p.close();
            p.show();
            scene.focusOn("USB");
        } } },
        State { name: "online"; StateChangeScript { script: {
            TvSettings.network = { "returnValue": true, "isInternetConnectionAvailable": true, "wired": { "state": "connected", "onInternet": "yes" }, "wifi": { "state": "disconnected" } };
            p.close();
            p.show();
            scene.focusOn("LG Home");
        } } }
    ]
}
