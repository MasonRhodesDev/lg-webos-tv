import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// The layer's late claims against a fake LG root: an overlay view whose item LG creates, destroys and creates again,
// and a notification view that loads after the layer starts. Prints each step and exits 1 on the first failure:
// qml LateClaims.qml
Window {
    id: win
    width: 1920; height: 1080
    visible: true

    Item {
        id: host
        anchors.fill: parent
        property var notificationView: null

        // LG's OverlayView: a system UI view whose currentView is the shown item's container.
        Item { id: overlay; property string viewName: "overlay"; property var currentView: null }
        // The wrapper holding LG's notification loader.
        Item { id: notificationLoader }
    }

    Component {
        id: overlayItem
        // StarfishSystemUIContainer → StarfishSystemUIWindow → the windowContent FocusScope.
        Item {
            Item { Item { objectName: "windowContent"; property int numButtons: 9 } }
        }
    }
    Component {
        id: notification
        // NotificationView's root and its toast view, both made under the loader.
        Item {
            property Item toast: Item {
                objectName: "toastView"
                parent: notificationLoader
                property var model: ListModel {}
                function close() {}
            }
        }
    }

    property var layer: null
    property var container: null
    property int step: 0

    function part(file) {
        for (var i = 0; i < layer.waiting.length; i++) if (layer.waiting[i].file.indexOf(file) >= 0) return layer.waiting[i].part;
        return null;
    }
    function reports(kind, file) {
        var n = 0;
        for (var i = 0; i < Fixture.reports.length; i++)
            if (Fixture.reports[i].kind === kind && Fixture.reports[i].text.indexOf(file) >= 0) n++;
        return n;
    }
    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) Qt.exit(1);
        return ok;
    }
    function windowContent() { return container.children[0].children[0]; }

    readonly property var steps: [
        function () {
            check(part("FakeOverlay").lg === null && !part("FakeOverlay").visible, "startup: overlay part holds nothing and is hidden");
            check(reports("waiting", "FakeOverlay") === 1 && reports("gap", "FakeOverlay") === 0, "startup: overlay part reported waiting, not a gap");
            check(reports("waiting", "Toast") === 1 && part("Toast").lg === null, "startup: toast part reported waiting");
            container = overlayItem.createObject(overlay);
            overlay.currentView = container;
        },
        function () {
            check(part("FakeOverlay").lg === windowContent(), "LG shows the overlay: claimed windowContent through the view's currentView");
            check(windowContent().opacity === 0 && part("FakeOverlay").visible, "claimed: LG's item at opacity 0, ours visible");
            check(reports("ok", "FakeOverlay") === 1, "claimed: reported ok once");
            container.destroy();
        },
        function () {
            check(part("FakeOverlay").lg === null && !part("FakeOverlay").visible, "LG destroys the overlay: lg is null, the part hides");
            // LG clears currentView after the item is gone; reading the stale value must not break the layer.
            overlay.currentView = null;
            container = overlayItem.createObject(overlay);
            overlay.currentView = container;
        },
        function () {
            check(part("FakeOverlay").lg === windowContent() && part("FakeOverlay").visible, "LG shows the overlay again: claimed again");
            check(reports("ok", "FakeOverlay") === 1, "reclaimed: no second ok report");
            var other = overlayItem.createObject(overlay);
            other.children[0].children[0].objectName = "somethingElse";
            overlay.currentView = other;
            check(part("FakeOverlay").lg === windowContent(), "a claimed part ignores later overlay changes");
            host.notificationView = notification.createObject(notificationLoader);
        },
        function () {
            var toast = host.notificationView.toast;
            check(part("Toast").lg === toast && toast.opacity === 0, "notification view loads late: toast view claimed under its loader");
            check(reports("ok", "Toast") === 1, "toast: reported ok");
            // LG's onLoadedCallback then reparents it to the root; the claim is the same object and holds.
            host.notificationView.parent = host;
            toast.parent = host;
            check(part("Toast").lg === toast, "toast view reparented to host: still claimed");
            console.log("late claims: all passed");
            Qt.quit();
        }
    ]

    Timer {
        interval: 50
        repeat: true
        running: win.layer !== null
        onTriggered: { win.steps[win.step++](); if (win.step >= win.steps.length) stop(); }
    }
    Timer { interval: 10000; running: true; onTriggered: { console.error("late claims: timed out"); Qt.exit(1); } }

    Component.onCompleted: {
        var c = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/Layer.qml"));
        if (c.status === Component.Error) { console.error(c.errorString()); Qt.exit(1); return; }
        layer = c.createObject(win.contentItem, {
            "host": host,
            "parts": [Qt.resolvedUrl("../../ui/Look/parts/Toast.qml"), Qt.resolvedUrl("parts/FakeOverlay.qml")]
        });
    }
}
