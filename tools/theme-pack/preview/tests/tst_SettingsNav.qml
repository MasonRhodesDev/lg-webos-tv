import QtQuick 2.4
import QtTest 1.0
import Preview 1.0
import Look 1.0

// Our Settings and quick sheet driven by remote keys, against the settings mock (TvSettings) and a fake LG root: the
// navigation stack (open at a target, move, enter, choose, adjust, back out to close), Hook A's table and entry
// window, the focus chain and LG's Back. Run by qmltestrunner (test/settings.test.js).
Item {
    id: root
    width: 1920
    height: 1080

    // LG's compositor root as our part sees it: the system UI manager, configd's settings and the key filter.
    Item {
        id: lgRoot
        property var systemSettings: QtObject { property var systemUIManager: ({}) }
        property var keyFilter: QtObject { signal backReleased(); property bool cursorVisible: false }
        Item {
            id: manager
            objectName: "systemUIManager"
            property var config: ({ "appinfo": [
                { "id": "com.webos.app.quicksettings", "defaultWindowType": "overlay", "main": Qt.resolvedUrl("parts/FakeLgQuickSettings.qml") },
                { "id": "com.webos.app.quickinputpicker", "defaultWindowType": "overlay", "main": "file:///usr/lib/qt5/qml/InputPicker/InputPicker.qml" }
            ] })
            property var launched: []
            function launch(appId, payload) { launched.push(appId); }
        }
    }
    // Our layer, holding the host as Layer.qml does.
    Item { id: layer; anchors.fill: parent; property Item host: lgRoot }

    property var part: null

    function rows() { return part.menu.open ? part.menu.page.list : part.quick.view.list; }
    function focused() { var l = rows(); return l.rows[l.currentIndex] ? l.rows[l.currentIndex].label : ""; }
    function topId() { return part.menu.topEntry.id; }
    function openSettings(target, at) {
        Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] }, "style": { "id": "smoke", "tokens": {} },
                                      "themes": [], "settings": { "open": true, "target": target, "at": at } }));
    }

    function reported(kind, text) {
        for (var i = 0; i < Fixture.reports.length; i++) if (Fixture.reports[i].kind === kind && Fixture.reports[i].text.indexOf(text) >= 0) return true;
        return false;
    }

    TestCase {
        name: "SettingsNav"
        when: windowShown

        function initTestCase() {
            var c = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/parts/Settings.qml"));
            verify(c.status === Component.Ready, c.errorString());
            part = c.createObject(layer, { "focusChain": Qt.resolvedUrl("parts/FakeFocus.qml") });
            verify(part !== null);
            // Look's subscription's first answer only records where requests stand.
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] }, "style": { "id": "smoke", "tokens": {} },
                                          "themes": [], "settings": { "open": false, "at": 1 } }));
        }

        function test_1_hookA_table() {
            var qs = manager.config.appinfo[0];
            compare(qs.id, "com.webos.app.quicksettings");
            verify(/settings\/QuickSettingsEntry\.qml$/.test(qs.main), "the Quick Settings entry loads ours: " + qs.main);
            verify(/InputPicker\.qml$/.test(manager.config.appinfo[1].main), "other entries untouched");
            // configd answers again: the copy is made again from its value.
            lgRoot.systemSettings.systemUIManager = { "appinfo": [{ "id": "com.webos.app.quicksettings", "defaultWindowType": "overlay",
                                                                   "main": String(Qt.resolvedUrl("parts/FakeLgQuickSettings.qml")) }] };
            verify(/QuickSettingsEntry\.qml$/.test(manager.config.appinfo[0].main), "re-applied after configd's change");
            verify(/FakeLgQuickSettings\.qml$/.test(SettingsBus.lgQuickSettings), "LG's own entry is remembered");
            verify(reported("ready", "settings: host ready"), "ready is reported once the hook is live");
        }

        function rowNamed(label) {
            var l = rows();
            for (var i = 0; i < l.rows.length; i++) if (l.rows[i].label === label) return i;
            return -1;
        }
        function focusRow(label) {
            var i = rowNamed(label);
            verify(i >= 0, "a row " + label);
            rows().currentIndex = i;
            compare(focused(), label);
            return rows().rows[i];
        }

        // The boards' content: subtitles, picker hints, the footer and the rows the store's adapters fill in.
        function test_1b_board_content() {
            openSettings("picture", 100);
            compare(topId(), "Picture");
            compare(part.menu.page.sub, "Applies to HDMI 2", "the Picture page names the input");
            compare(part.menu.footer.text, "Offline \u00b7 telemetry off", "the footer: offline, LG's data agreements withdrawn");
            TvSettings.values[""].eulaStatus.voiceAllowed = true;
            TvSettings.notify("", "eulaStatus");
            compare(part.menu.footer.text, "Offline \u00b7 telemetry on", "and follows the agreements live");
            TvSettings.values[""].eulaStatus.voiceAllowed = false;
            TvSettings.notify("", "eulaStatus");
            // Without the telemetry-off kit in force, the agreements claim only themselves.
            TvSettings.telemetryKit = "inactive";
            part.menu.close();
            openSettings("picture", 99);
            compare(part.menu.footer.text, "Offline \u00b7 agreements withdrawn", "no kit: the agreements, not telemetry");
            TvSettings.telemetryKit = "active";
            part.menu.close();
            openSettings("picture", 100);
            compare(part.menu.footer.text, "Offline \u00b7 telemetry off", "the kit is read again on each open");

            focusRow("Picture mode");
            keyClick(Qt.Key_Return);
            compare(topId(), "pick:pictureMode");
            compare(part.menu.page.sub, "HDMI 2 \u00b7 4K \u00b7 120 Hz", "the picture-mode picker shows the signal");
            compare(rows().rows[rowNamed("Game")].hint, "Lowest input lag", "a picker value's hint");
            compare(rows().rows[rowNamed("Filmmaker")].hint, "Current");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Picture");

            openSettings("sound", 101);
            var r = focusRow("AV sync adjustment");
            compare(r.variant, "value", "a switch shown as a value");
            compare(r.value, "Off");
            keyClick(Qt.Key_Return);
            compare(topId(), "pick:avSync", "opens a picker of its two values");
            compare(rows().rows.length, 2);
            focusRow("On");
            keyClick(Qt.Key_Return);
            compare(TvSettings.values.sound.avSync, "on", "choosing writes it");
            compare(rows().rows[rows().currentIndex].value, "On");
            compare(rows().rows[rowNamed("Bluetooth surround")].value, "Off", "Bluetooth surround reads the sound output");

            openSettings("general", 102);
            compare(part.menu.page.sub, "webOS 4.10.0 \u00b7 05.40.45", "General names the software");
            compare(rows().rows[rowNamed("Language")].value, "English", "a link shows its setting's value");
            compare(rows().rows[rowNamed("Time and date")].value, "Manual");
            compare(rows().rows[rowNamed("About this TV")].value, "OLED55B9PUA");
            compare(rowNamed("Look"), 7, "Look follows the board's seven rows");
            r = focusRow("Reset to initial settings");
            compare(r.variant, "nav", "an action that opens something has a chevron");
            keyClick(Qt.Key_Return);
            verify(part.menu.confirming !== null, "and the factory reset asks first");
            part.menu.confirming = null;
            TvSettings.preferences.useNetworkTime = true;
            TvSettings.notify("", "prefs");
            compare(rows().rows[rowNamed("Time and date")].value, "Automatic", "network time, live");
            TvSettings.preferences.useNetworkTime = false;
            TvSettings.notify("", "prefs");

            openSettings("connection", 103);
            var n = TvSettings.calls.length;
            focusRow("Device connector");
            keyClick(Qt.Key_Return);
            var c = TvSettings.calls[TvSettings.calls.length - 1];
            verify(TvSettings.calls.length > n && c.method === "/launch" && c.params.id === "com.webos.app.connectionwizard",
                   "Device connector opens LG's connection wizard");

            openSettings("support", 104);
            compare(part.menu.page.sub, "Offline: online help is unavailable");
            compare(rows().rows[rowNamed("Software update")].hint, "Updates are blocked while the TV stays offline", "offline: the hint");
            compare(rows().rows[rowNamed("Software update")].value, "Paused");
            focusRow("Signal test");
            keyClick(Qt.Key_Return);
            compare(topId(), "SignalTest", "Signal test opens the live signal");
            compare(part.menu.page.sub, "HDMI 2");
            compare(rows().rows[rowNamed("HDMI mode")].value, "HDMI");
            compare(rows().rows[rowNamed("Resolution")].value, "3840 \u00d7 2160");
            compare(rows().rows[rowNamed("Frame rate")].value, "120 Hz");
            compare(rows().rows[rowNamed("Scan type")].value, "Progressive");
            TvSettings.hdmi.frameRate = 60;
            TvSettings.notify("", "signal");
            compare(rows().rows[rowNamed("Frame rate")].value, "60 Hz", "and follows the source");
            TvSettings.hdmi.frameRate = 120;
            TvSettings.notify("", "signal");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Support");
            compare(rows().rows[rowNamed("Privacy and terms")].value, "Agreements withdrawn");
            TvSettings.network.isInternetConnectionAvailable = true;
            part.store.channels.network.services[0].call("luna://com.webos.service.connectionmanager", "/getstatus", "{}");
            compare(rows().rows[rowNamed("Software update")].hint, "", "online: no hint");
            compare(part.menu.footer.text, "Online \u00b7 telemetry off");
            TvSettings.network.isInternetConnectionAvailable = false;
            part.store.channels.network.services[0].call("luna://com.webos.service.connectionmanager", "/getstatus", "{}");
            part.menu.close();

            SettingsBus.quickSettingsRequested(null);
            compare(part.quick.view.sub, "HDMI 2 \u00b7 4K \u00b7 120 Hz", "the quick sheet shows the input and its signal");
            TvSettings.values.dimensionInfo.input = "dtv";
            TvSettings.notify("dimensionInfo", "input");
            compare(part.quick.view.sub, "Live TV", "no HDMI input, no signal line");
            TvSettings.values.dimensionInfo.input = "hdmi2";
            TvSettings.notify("dimensionInfo", "input");
            keyClick(Qt.Key_Escape);
            verify(!part.quick.open);
        }

        function test_2_settings_target_and_keys() {
            openSettings("SoundOut", 2);
            verify(part.menu.open, "openSettings opens our Settings");
            compare(part.menu.stack.length, 2);
            compare(topId(), "SoundOut");
            compare(part.focusHandler.log[part.focusHandler.log.length - 1], "request 7", "focus taken through LG's chain at layer 7");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Sound", "Back goes up one page");
            compare(focused(), "Sound mode");
            keyClick(Qt.Key_Down);
            compare(focused(), "Sound out");
            keyClick(Qt.Key_Return);
            compare(topId(), "pick:soundOutput", "OK on a value opens its picker");
            compare(focused(), "TV speakers", "the picker lands on the current value");
            keyClick(Qt.Key_Down);
            compare(focused(), "HDMI ARC");
            keyClick(Qt.Key_Return);
            compare(TvSettings.values.sound.soundOutput, "external_arc", "choosing writes the setting");
            compare(topId(), "Sound", "and goes back");
            compare(focused(), "Sound out", "focus is back on the row that opened it");
            compare(rows().rows[rows().currentIndex].value, "HDMI ARC", "the row shows the new value");
            keyClick(Qt.Key_Down);
            compare(focused(), "Balance");
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Right);
            compare(rows().rows[rows().currentIndex].valueText, "R 2", "a slider moves at once");
            wait(250);
            compare(TvSettings.values.sound.audioBalance, 2, "and the last value is written");
        }

        function test_3_back_out_to_close() {
            keyClick(Qt.Key_Left);
            compare(TvSettings.values.sound.audioBalance, 2, "Left on a slider moves it");
            wait(250);
            keyClick(Qt.Key_Up);
            compare(focused(), "Sound out");
            keyClick(Qt.Key_Left);
            compare(part.menu.area, "categories", "Left on a category's page goes to the categories");
            keyClick(Qt.Key_Down);
            compare(part.menu.categories.currentIndex, 2);
            compare(topId(), "Network", "moving in the categories shows that category's page");
            keyClick(Qt.Key_Right);
            compare(part.menu.area, "page");
            keyClick(Qt.Key_Escape);
            compare(part.menu.area, "categories");
            var before = Fixture.commands.length;
            keyClick(Qt.Key_Escape);
            verify(!part.menu.open, "Back in the categories closes");
            compare(Fixture.commands[before].method, "/closeSettings", "and tells the Look service");
            compare(part.focusHandler.log[part.focusHandler.log.length - 1], "release 7", "focus handed back");
        }

        function test_4_quick_sheet() {
            var container = Qt.createComponent(Qt.resolvedUrl("parts/FakeSystemUiContainer.qml")).createObject(root);
            var entry = Qt.createComponent(Qt.resolvedUrl("../../ui/Look/settings/QuickSettingsEntry.qml")).createObject(container);
            container.lifeCycleStatusChanged({ "event": "launch", "reason": "preload" });
            verify(!part.quick.open, "a boot preload opens nothing");
            compare(container.exits, 1, "and exits");
            container.lifeCycleStatusChanged({ "event": "launch", "params": undefined });
            verify(part.quick.open, "the gear opens the quick sheet");
            compare(container.exits, 2, "LG's window exits at once");
            compare(focused(), "Picture mode");
            keyClick(Qt.Key_Down);
            keyClick(Qt.Key_Down);
            compare(focused(), "Volume");
            keyClick(Qt.Key_Right);
            compare(TvSettings.volume, 21, "volume writes are paced");
            wait(250);
            compare(TvSettings.volume, 22, "Right steps the volume");
            keyClick(Qt.Key_Down);
            keyClick(Qt.Key_Down);
            compare(focused(), "Energy saving");
            keyClick(Qt.Key_Return);
            compare(TvSettings.values.picture.energySaving, "auto", "OK flips Energy saving on");
            TvSettings.fail["picture.energySaving"] = true;
            keyClick(Qt.Key_Return);
            compare(rows().rows[rows().currentIndex].on, true, "a refused write is rolled back");
            keyClick(Qt.Key_Up);
            keyClick(Qt.Key_Return);
            compare(part.quick.topEntry.id, "pick:sleepTimer", "OK on Sleep timer opens its picker in the sheet");
            keyClick(Qt.Key_Down);
            keyClick(Qt.Key_Return);
            compare(TvSettings.sleepMinutes, 10, "choosing sets the sleep timer");
            compare(rows().rows[rows().currentIndex].value, "10 min", "read back after the write");
            // A repeat of the gear while the sheet arrives is ignored; a later press closes it.
            part.openedAt = new Date().getTime();
            container.lifeCycleStatusChanged({ "event": "launch" });
            verify(part.quick.open, "a repeat during the open animation is ignored");
            part.openedAt = 0;
            container.lifeCycleStatusChanged({ "event": "launch" });
            verify(!part.quick.open, "the gear again closes it");
        }

        function test_5_hotkey_and_all_settings() {
            SettingsBus.quickSettingsRequested({ "activateType": "picture-mode" });
            compare(part.quick.topEntry.id, "pick:pictureMode", "the picture-mode hotkey opens its picker");
            compare(focused(), "Filmmaker");
            keyClick(Qt.Key_Escape);
            compare(part.quick.topEntry.id, "quick");
            compare(focused(), "Picture mode");
            for (var i = 0; i < 6; i++) keyClick(Qt.Key_Down);
            compare(focused(), "All settings");
            keyClick(Qt.Key_Return);
            verify(!part.quick.open && part.menu.open, "All settings swaps the sheet for Settings");
            compare(part.menu.area, "categories");
        }

        function test_6_lg_back_closes() {
            verify(part.menu.open);
            lgRoot.keyFilter.backReleased();
            verify(!part.menu.open && !part.quick.open, "LG's backReleased (it goes Home) closes ours");
            var open = 0;
            for (var i = 0; i < TvSettings.subs.length; i++) if (!TvSettings.subs[i].cancelled) open++;
            compare(open, 0, "closed menus hold no subscriptions");
        }

        function test_7_confirm_and_lg_targets() {
            openSettings("PictureMode", 3);
            compare(part.menu.stack.length, 2);
            var l = rows();
            for (var i = 0; i < 30 && focused() !== "Reset picture mode"; i++) keyClick(Qt.Key_Down);
            compare(focused(), "Reset picture mode");
            keyClick(Qt.Key_Return);
            verify(part.menu.confirming !== null, "an action with a confirmation asks first");
            compare(part.menu.dialog.currentIndex, 0, "the safe button has focus");
            var n = TvSettings.calls.length;
            // Keys reach the dialog's buttons once its panel has started to show (Qt forwards keys to visible items only).
            wait(50);
            keyClick(Qt.Key_Return);
            verify(part.menu.confirming === null);
            compare(TvSettings.calls.length, n, "Cancel does nothing");
            openSettings("parentalControls", 4);
            compare(topId(), "Safety", "LG's deep-link names land on their page");
            compare(part.menu.stack[0].id, "General");
            openSettings("nonsense", 5);
            compare(topId(), "Picture", "unknown targets land on Picture, as LG's do");
        }

        function test_8_unanswered_write_rolls_back() {
            part.store.writeTimeout = 300;
            SettingsBus.quickSettingsRequested(null);
            for (var i = 0; i < 4; i++) keyClick(Qt.Key_Down);
            compare(focused(), "Energy saving");
            var before = rows().rows[rows().currentIndex].on, live = part.store.inflight.length;
            TvSettings.silent["picture.energySaving"] = true;
            keyClick(Qt.Key_Return);
            compare(rows().rows[rows().currentIndex].on, !before, "the new value shows at once");
            compare(part.store.inflight.length, live + 1);
            wait(700);
            compare(rows().rows[rows().currentIndex].on, before, "no answer: rolled back");
            compare(part.store.inflight.length, live, "and its bus object is gone");
            verify(reported("warning", "the TV did not answer"), "and it is reported");
            delete TvSettings.silent["picture.energySaving"];
            keyClick(Qt.Key_Escape);
            verify(!part.quick.open);
        }

        function test_9_no_host_hands_the_gear_to_lg() {
            part.destroy();
            wait(50);
            verify(!SettingsBus.ready, "the host is gone");
            verify(/FakeLgQuickSettings\.qml$/.test(manager.config.appinfo[0].main), "LG's table is restored when the host goes");
            var container = Qt.createComponent(Qt.resolvedUrl("parts/FakeSystemUiContainer.qml")).createObject(root);
            Qt.createComponent(Qt.resolvedUrl("../../ui/Look/settings/QuickSettingsEntry.qml")).createObject(container);
            container.lifeCycleStatusChanged({ "event": "launch", "params": { "activateType": "sleep" } });
            var lg = null;
            for (var i = 0; i < container.children.length; i++) if (container.children[i].objectName === "fakeLgQuickSettings") lg = container.children[i];
            verify(lg !== null, "with no host, the launch loads LG's own Quick Settings");
            compare(lg.events.length, 1);
            compare(lg.events[0].params.activateType, "sleep", "and hands it this launch");
            compare(container.exits, 0, "our window does not close it");
            container.lifeCycleStatusChanged({ "event": "close" });
            compare(lg.events.length, 2, "later events go to LG's window");
            verify(reported("error", "no host listening"), "the fallback is reported");
        }
    }
}
