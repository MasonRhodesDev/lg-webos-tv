import QtQuick 2.4
import Preview 1.0

// Our Home dock, drawn by the real part against the settings mock (TvSettings): watching HDMI 2 at 4K 120 Hz, two
// installed apps, no USB drive, the internet blocked (so the Offline badge shows). Each state opens it through the
// part's own API and sets focus with the ribbon's own currentIndex.
Item {
    id: scene
    property rect frame: Qt.rect(0, 600, 1920, 480)
    readonly property var p: loader.item
    Loader { id: loader; anchors.fill: parent; source: Qt.resolvedUrl("../../ui/Look/parts/Home.qml") }

    function focusOn(label) {
        var t = p.tiles;
        for (var i = 0; i < t.length; i++) if (t[i].label === label) { p.ribbon.currentIndex = i; return; }
    }

    // Base: opened by the Home key, focus on the input being watched.
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
