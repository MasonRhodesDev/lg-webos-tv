import QtQuick 2.4
import QtTest 1.0
import Preview 1.0
import Look 1.0

// The Home dock against the settings mock (TvSettings) and a fake LG root: the key filter put in LG's chain and given
// back, our entry in the system UI table and its window, opening, moving, switching, Back, a second Home, a change of
// the app in front, the popup plane shared with our Settings, and retiring. Run by qmltestrunner (test/layer.test.js).
Item {
    id: root
    width: 1920
    height: 1080

    readonly property var lgFilters: [
        { "handler": "handleScreenSaver", "file": "/usr/lib/qt5/qml/KeyFilters/systemUi.js" },
        { "handler": "handleAccessibility", "file": "/usr/lib/qt5/qml/KeyFilters/appLaunch.js" },
        { "handler": "handleSystemKeys", "file": "/usr/lib/qt5/qml/KeyFilters/systemUi.js" },
        { "handler": "handleHotkeys", "file": "/usr/lib/qt5/qml/KeyFilters/appLaunch.js" }
    ]

    // LG's compositor root as our parts see it: configd's settings, the key filter, the system UI manager and the
    // popup plane (layer 6, hidden while empty).
    Item {
        id: lgRoot
        anchors.fill: parent
        property var systemSettings: QtObject {
            property var systemUIManager: ({ "appinfo": [{ "id": "com.webos.app.quicksettings", "defaultWindowType": "overlay",
                                                           "main": "file:///usr/lib/qt5/qml/QuickSettings/QuickSettings.qml" }] })
            property var keyFilters: root.lgFilters
        }
        property var keyFilter: QtObject {
            signal backReleased()
            property bool cursorVisible: false
            // As in YSM: bound to configd's list; every assignment reloads the chain.
            property var keyFilters: lgRoot.systemSettings.keyFilters
            property int reloads: 0
            onKeyFiltersChanged: reloads++
        }
        Item {
            id: manager
            objectName: "systemUIManager"
            property var config: lgRoot.systemSettings.systemUIManager
            function launch(appId, payload) { }
        }
        Item {
            id: plane
            anchors.fill: parent
            property var backKeyFilter: null
            property var currentView: null
            property int layerNumber: 6
            property var model: ListModel { }
            z: 3
            visible: false
        }
    }
    Item { id: layer; anchors.fill: parent; z: 10; property Item host: lgRoot }

    property var settings: null
    property var home: null

    function ours(list) {
        for (var i = 0; i < list.length; i++) if (list[i].handler === "themepackHandleHome") return i;
        return -1;
    }
    function launched(id) {
        for (var i = TvSettings.calls.length - 1; i >= 0; i--) {
            var c = TvSettings.calls[i];
            if (c.method === "/launch" && c.params.id === id) return c.params;
        }
        return null;
    }
    function focusedLabel() { return home.probe.focus ? home.probe.focus.label : ""; }

    TestCase {
        name: "HomeDock"
        when: windowShown

        function initTestCase() {
            var c = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/parts/Settings.qml"));
            verify(c.status === Component.Ready, c.errorString());
            settings = c.createObject(layer, { "focusChain": Qt.resolvedUrl("parts/FakeFocus.qml") });
            c = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/parts/Home.qml"));
            verify(c.status === Component.Ready, c.errorString());
            home = c.createObject(layer, { "focusChain": Qt.resolvedUrl("parts/FakeFocus.qml") });
            verify(settings !== null && home !== null);
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] }, "style": { "id": "smoke", "tokens": {} },
                                          "themes": [], "settings": { "open": false, "at": 1 } }));
        }

        function test_1_key_filter_and_table() {
            var list = lgRoot.keyFilter.keyFilters, at = ours(list);
            compare(at, 2, "ours sits just ahead of LG's Home handling");
            compare(list[at + 1].handler, "handleSystemKeys");
            compare(list.length, lgFilters.length + 1, "LG's filters all kept");
            verify(/^\/.*\/home-key\.js$/.test(list[at].file), "a plain filesystem path: " + list[at].file);
            verify(home.probe.keys, "the probe says the filter is in");
            var table = manager.config.appinfo, entry = null;
            for (var i = 0; i < table.length; i++) if (table[i].id === "dev.themepack.home") entry = table[i];
            verify(entry !== null, "our entry is in the system UI table");
            compare(entry.defaultWindowType, "overlay");
            verify(/settings\/HomeEntry\.qml$/.test(entry.main), entry.main);
            // configd's list changes: the chain is made again from it, ours still in.
            lgRoot.systemSettings.keyFilters = lgFilters.concat([{ "handler": "handleMagicNumber", "file": "/usr/lib/qt5/qml/KeyFilters/systemUi.js" }]);
            list = lgRoot.keyFilter.keyFilters;
            compare(list.length, lgFilters.length + 2);
            compare(ours(list), 2);
            compare(list[list.length - 1].handler, "handleMagicNumber");
        }

        function test_2_entry_window() {
            var c = Qt.createComponent(Qt.resolvedUrl("parts/FakeSystemUiContainer.qml"));
            var box = c.createObject(root);
            var e = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/settings/HomeEntry.qml")).createObject(box);
            verify(e !== null);
            box.lifeCycleStatusChanged({ "event": "launch", "reason": "preload" });
            verify(!home.open, "a preload opens nothing");
            compare(box.exits, 1, "and exits");
            box.lifeCycleStatusChanged({ "event": "launch" });
            verify(home.open, "a launch opens the dock");
            compare(box.exits, 2, "and the window exits at once");
            home.close();
            box.destroy();
        }

        function test_3_open_move_switch() {
            SettingsBus.homeRequested(null);
            verify(home.open);
            compare(focusedLabel(), "HDMI 2", "focus starts on the input being watched");
            compare(home.ribbon.spec(home.ribbon.currentIndex).badge, "Watching");
            compare(home.ribbon.spec(home.ribbon.currentIndex).sub, "4K · 120 Hz");
            compare(home.parent, plane, "the dock lives in LG's popup plane while open");
            verify(plane.visible, "which is shown");
            compare(plane.z, layer.z, "and raised to our layer");
            compare(home.focusHandler.log[home.focusHandler.log.length - 1], "request 7", "focus taken through LG's chain at layer 7");
            verify(home.probe.tiles.indexOf("LG Home") >= 0 && home.probe.tiles.indexOf("Settings") >= 0);
            verify(home.probe.tiles.indexOf("Player") >= 0, "installed apps are tiles");
            verify(home.probe.tiles.indexOf("Web Browser") < 0, "LG's own apps are not");
            keyClick(Qt.Key_Right);
            compare(focusedLabel(), "HDMI 3");
            keyClick(Qt.Key_Left);
            keyClick(Qt.Key_Left);
            compare(focusedLabel(), "HDMI 1");
            keyClick(Qt.Key_Return);
            verify(!home.open, "OK switches and closes");
            verify(launched("com.webos.app.hdmi1") !== null, "HDMI 1 launched through the application manager");
            compare(home.parent, layer, "the dock is back in our layer");
            verify(!plane.visible, "the empty plane hides again");
            compare(plane.z, 3, "at its own height");
            compare(home.focusHandler.log[home.focusHandler.log.length - 1], "release 7", "focus handed back");
        }

        function test_4_usb_needs_a_drive() {
            SettingsBus.homeRequested(null);
            var t = home.ribbon.model, usb = -1;
            for (var i = 0; i < t.length; i++) if (t[i].label === "USB") usb = i;
            verify(usb >= 0);
            verify(t[usb].disabled, "no drive: the USB tile is disabled");
            compare(t[usb].sub, "No drive");
            verify(!home.ribbon.focusable(usb), "and focus skips it");
            home.close();
        }

        function test_5_closing() {
            SettingsBus.homeRequested(null);
            keyClick(Qt.Key_Escape);
            verify(!home.open, "Back closes");
            SettingsBus.homeRequested(null);
            lgRoot.keyFilter.backReleased();
            verify(!home.open, "LG's backReleased closes");
            SettingsBus.homeRequested(null);
            SettingsBus.homeRequested(null);
            verify(!home.open, "a second Home closes");
            SettingsBus.homeRequested(null);
            TvSettings.setForeground("org.example.radio");
            verify(!home.open, "a change of the app in front closes");
            SettingsBus.homeRequested(null);
            compare(focusedLabel(), "Radio", "an app in front is the one marked");
            TvSettings.setForeground("org.example.radio");
            verify(home.open, "the same app again is no change");
            home.close();
        }

        function test_6_plane_shared_with_settings() {
            SettingsBus.homeRequested(null);
            compare(home.parent, plane);
            settings.settings("");
            verify(settings.menu.open, "Settings opens");
            verify(!home.open, "and the dock closed first");
            compare(settings.parent, plane, "Settings holds the plane");
            compare(home.parent, layer);
            verify(plane.visible);
            SettingsBus.homeRequested(null);
            verify(home.open && !settings.shown, "Home closes Settings");
            compare(home.parent, plane);
            compare(settings.parent, layer);
            home.close();
            verify(!plane.visible, "both gone: the plane hides");
            compare(plane.z, 3, "at its own height");
            // The dock's Settings tile opens our Settings.
            SettingsBus.homeRequested(null);
            var t = home.ribbon.model;
            for (var i = 0; i < t.length; i++) if (t[i].label === "Settings") home.ribbon.currentIndex = i;
            keyClick(Qt.Key_Return);
            verify(!home.open && settings.menu.open, "the Settings tile opens our Settings");
            compare(settings.parent, plane);
            settings.closeAll();
            verify(!plane.visible);
        }

        function test_7_retire() {
            var reloads = lgRoot.keyFilter.reloads;
            SettingsBus.homeRequested(null);
            settings.retire();
            home.retire();
            var list = lgRoot.keyFilter.keyFilters;
            compare(ours(list), -1, "LG's chain is back");
            compare(list.length, lgRoot.systemSettings.keyFilters.length);
            compare(lgRoot.keyFilter.reloads, reloads + 1, "given back once");
            verify(!home.open && home.parent === layer && !plane.visible, "the dock closed and the plane given back");
            verify(!SettingsBus.homeReady, "no dock listening");
            for (var i = 0; i < manager.config.appinfo.length; i++) verify(manager.config.appinfo[i].id !== "dev.themepack.home", "our entry is out of the table");
            home.retire();
            settings.retire();
            compare(lgRoot.keyFilter.reloads, reloads + 1, "a second retire changes nothing");
            SettingsBus.homeRequested(null);
            verify(!home.open, "a retired dock does not open");
            // configd's list changes after retiring: nothing of ours comes back.
            lgRoot.systemSettings.keyFilters = lgFilters;
            compare(ours(lgRoot.keyFilter.keyFilters), -1);
        }
    }
}
