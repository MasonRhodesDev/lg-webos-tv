import QtQuick 2.4
import Preview 1.0

// Our Settings (the owner's Settings boards), drawn by the real part against the settings mock (TvSettings). Each
// state opens it somewhere through the part's own API and sets focus with the kit lists' own currentIndex.
Item {
    id: scene
    property rect frame: Qt.rect(0, 0, 1920, 1080)
    readonly property var p: loader.item
    Loader { id: loader; anchors.fill: parent; source: Qt.resolvedUrl("../../ui/Look/parts/Settings.qml") }

    function rowOf(list, label) {
        for (var i = 0; i < list.rows.length; i++) if (list.rows[i].label === label) return i;
        return 0;
    }

    // Base: the categories, as the Home screen's Settings tile opens it.
    Component.onCompleted: p.settings("")
    states: [
        State { name: "picture"; StateChangeScript { script: p.settings("picture") } },
        State { name: "picture-mode"; StateChangeScript { script: {
            p.settings("picture");
            p.menu.page.list.currentIndex = 0;
            p.menu.page.run(p.menu.page.rows[0]);
            p.menu.page.list.currentIndex = rowOf(p.menu.page.list, "Game");
        } } },
        State { name: "sound"; StateChangeScript { script: p.settings("sound") } },
        State { name: "connection"; StateChangeScript { script: { p.settings("connection"); p.menu.page.list.currentIndex = 3; } } },
        State { name: "general-categories"; StateChangeScript { script: { p.settings(""); p.menu.categories.currentIndex = 3; } } },
        State { name: "general"; StateChangeScript { script: p.settings("general") } },
        State { name: "accessibility"; StateChangeScript { script: { p.settings("accessibility"); p.menu.page.list.currentIndex = 3; } } },
        State { name: "support"; StateChangeScript { script: { p.settings("support"); p.menu.page.list.currentIndex = 1; } } },
        State { name: "signal-test"; StateChangeScript { script: p.settings("SignalTest") } },
        State { name: "look"; StateChangeScript { script: { p.settings("Look"); p.menu.page.list.currentIndex = 2; } } },
        State { name: "confirm"; StateChangeScript { script: {
            p.settings("PictureMode");
            var l = p.menu.page.list;
            l.currentIndex = rowOf(l, "Reset picture mode");
            p.menu.confirming = l.rows[l.currentIndex];
        } } },
        State { name: "stub-page"; StateChangeScript { script: p.settings("Channels") } },
        // Lists, forms and the PIN.
        State { name: "wifi"; StateChangeScript { script: { TvSettings.wifiState = "serviceEnabled"; p.settings("wifi"); focusOn("Cafe Corner"); } } },
        State { name: "wifi-password"; StateChangeScript { script: {
            TvSettings.wifiState = "serviceEnabled"; p.settings("wifi");
            focusOn("Garage");
            p.menu.page.run(p.menu.page.focusedRow);
            p.menu.entry.text = "wrench1";
            var at = p.menu.entry.keyboard.locate("2");
            p.menu.entry.keyboard.layout = "symbols";
            at = p.menu.entry.keyboard.locate("2");
            p.menu.entry.keyboard.row = at.row;
            p.menu.entry.keyboard.col = at.col;
        } } },
        State { name: "wifi-forget"; StateChangeScript { script: { TvSettings.wifiState = "serviceEnabled"; p.settings("wifi"); focusOn("Home"); p.menu.confirming = p.menu.page.focusedRow; } } },
        State { name: "bluetooth"; StateChangeScript { script: { p.settings("bluetooth"); p.store.btSearch(); focusOn("Headphones"); } } },
        State { name: "bluetooth-pair"; StateChangeScript { script: {
            p.settings("bluetooth");
            p.store.btSearch();
            focusOn("Headphones");
            p.menu.confirming = p.menu.page.focusedRow;
        } } },
        State { name: "pin"; StateChangeScript { script: { p.settings("pin"); focusOn("Change PIN"); } } },
        State { name: "pin-prompt"; StateChangeScript { script: {
            p.settings("pin");
            focusOn("Locks");
            p.menu.pinning = { "mode": "check", "row": p.menu.page.focusedRow };
            p.menu.pin.pin = "12";
            p.menu.pin.pad.currentIndex = 4;
        } } },
        State { name: "pin-wrong"; StateChangeScript { script: {
            p.settings("pin");
            focusOn("Locks");
            p.menu.pinning = { "mode": "check", "row": p.menu.page.focusedRow };
            p.menu.pinEntered("1234");
        } } },
        State { name: "keyboard-input"; StateChangeScript { script: p.settings("keyboard-input") } },
        State { name: "tv-name"; StateChangeScript { script: {
            p.settings("keyboard-input");
            focusOn("TV name");
            p.menu.page.run(p.menu.page.focusedRow);
            p.menu.entry.keyboard.row = 2;
            p.menu.entry.keyboard.col = 8;
        } } }
    ]
    function focusOn(label) { p.menu.page.list.currentIndex = rowOf(p.menu.page.list, label); }
}
