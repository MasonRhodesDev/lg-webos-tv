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
            // As in YSM: bound to configd's value, which is {} until configd answers.
            property var config: lgRoot.systemSettings.systemUIManager
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

    function toasted(text) {
        for (var i = 0; i < TvSettings.calls.length; i++) {
            var c = TvSettings.calls[i];
            if (c.method === "/createToast" && c.params.message.indexOf(text) >= 0) return true;
        }
        return false;
    }
    function called(method, key, value) {
        for (var i = TvSettings.calls.length - 1; i >= 0; i--) {
            var c = TvSettings.calls[i];
            if (c.method === method && (key === undefined || JSON.stringify(c.params).indexOf(key) >= 0)) return c.params;
        }
        return null;
    }
    function specOf(ref) {
        var l = rows();
        for (var i = 0; i < l.rows.length; i++) if (l.rows[i].ref === ref || String(l.rows[i].ref).split("/").pop() === ref) return i;
        return -1;
    }
    function specNamed(label) {
        var l = rows();
        for (var i = 0; i < l.rows.length; i++) if (l.rows[i].label === label) return l.rows[i];
        return null;
    }
    function reported(kind, text) {
        for (var i = 0; i < Fixture.reports.length; i++) if (Fixture.reports[i].kind === kind && Fixture.reports[i].text.indexOf(text) >= 0) return true;
        return false;
    }

    TestCase {
        name: "SettingsNav"
        when: windowShown

        function down(label) {
            for (var i = 0; i < 30 && focused() !== label; i++) keyClick(Qt.Key_Down);
            for (i = 0; i < 30 && focused() !== label; i++) keyClick(Qt.Key_Up);
        }
        // Our keyboard, driven by the D-pad only: arrows to the key, then OK.
        function goKey(label) {
            var kb = part.menu.entry.keyboard, at = kb.locate(label);
            for (var i = 0; i < 6 && kb.row !== at.row; i++) keyClick(kb.row < at.row ? Qt.Key_Down : Qt.Key_Up);
            for (i = 0; i < 12 && kb.col !== at.col; i++) keyClick(kb.col < at.col ? Qt.Key_Right : Qt.Key_Left);
            compare(kb.rows[kb.row][kb.col].label, label, "the D-pad reaches " + label);
            keyClick(Qt.Key_Return);
        }
        function typeText(text) {
            var kb = part.menu.entry.keyboard;
            for (var i = 0; i < text.length; i++) {
                if (!kb.locate(text.charAt(i))) goKey(kb.layout === "letters" ? "123" : "ABC");
                goKey(text.charAt(i));
            }
        }
        function padTo(digit) {
            var pad = part.menu.pin.pad, at = pad.keys.indexOf(digit);
            for (var i = 0; i < 4 && Math.floor(pad.currentIndex / 3) !== Math.floor(at / 3); i++) keyClick(pad.currentIndex < at ? Qt.Key_Down : Qt.Key_Up);
            for (i = 0; i < 3 && pad.currentIndex !== at; i++) keyClick(pad.currentIndex < at ? Qt.Key_Right : Qt.Key_Left);
            keyClick(Qt.Key_Return);
        }


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
            verify(manager.config.appinfo === undefined, "configd has not answered: the table is empty");
            verify(reported("waiting", "system UI table empty"), "Hook A waits for configd, not an error");
            verify(!reported("error", "system UI table"), "and reports no error");
            verify(!reported("ready", "settings: host ready"), "no ready before the hook applies");
            // configd answers.
            lgRoot.systemSettings.systemUIManager = { "appinfo": [
                { "id": "com.webos.app.quicksettings", "defaultWindowType": "overlay", "main": String(Qt.resolvedUrl("parts/FakeLgQuickSettings.qml")) },
                { "id": "com.webos.app.quickinputpicker", "defaultWindowType": "overlay", "main": "file:///usr/lib/qt5/qml/InputPicker/InputPicker.qml" }
            ] };
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
            // A reply without an answer is unknown, not the last one.
            TvSettings.telemetryKit = "active";
            part.menu.close();
            openSettings("picture", 98);
            compare(part.menu.footer.text, "Offline \u00b7 telemetry off");
            TvSettings.telemetryKit = "";
            part.menu.close();
            compare(part.store.values.telemetryKit, undefined, "closing forgets the kit's state");
            openSettings("picture", 97);
            compare(part.menu.footer.text, "Offline \u00b7 agreements withdrawn", "an unreadable kit reply claims nothing");
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
            focusRow("About this TV");
            keyClick(Qt.Key_Return);
            compare(topId(), "AboutThisTV");
            var about = rows().rows;
            verify(about.length > 0, "About this TV has rows");
            for (var u = 0; u < about.length; u++)
                verify(!/update/i.test((about[u].label || "") + " " + (about[u].ref || "")), "the TV is never updated: no " + about[u].label);
            keyClick(Qt.Key_Escape);
            compare(topId(), "General");
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
            compare(rowNamed("Software update"), -1, "the TV is never updated: no update row");
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
            TvSettings.values.dimensionInfo.input = "dtv";
            TvSettings.notify("dimensionInfo", "input");
            compare(part.menu.page.sub, "Live TV");
            var blank = ["HDMI mode", "Resolution", "Frame rate", "Scan type"];
            for (var b = 0; b < blank.length; b++) compare(rows().rows[rowNamed(blank[b])].value, "", "off HDMI: no " + blank[b]);
            TvSettings.values.dimensionInfo.input = "hdmi2";
            TvSettings.notify("dimensionInfo", "input");
            compare(rows().rows[rowNamed("Frame rate")].value, "120 Hz");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Support");
            compare(rows().rows[rowNamed("Privacy and terms")].value, "Agreements withdrawn");
            TvSettings.network.isInternetConnectionAvailable = true;
            part.store.channels.network.services[0].call("luna://com.webos.service.connectionmanager", "/getstatus", "{}");
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

        // settingsservice answers ranges as strings: a step writes the next value as a string, never the minimum.
        function test_1c_range_values_as_strings() {
            openSettings("picture", 98);
            compare(topId(), "Picture");
            compare(TvSettings.values.picture.contrast, "85");
            var r = focusRow("Contrast");
            compare(r.valueText, "85", "a string value reads as its number");
            verify(Math.abs(r.fraction - 0.85) < 0.001, "and draws at its level");
            keyClick(Qt.Key_Right);
            wait(250);
            compare(TvSettings.values.picture.contrast, "86", "Right writes \"86\", in the TV's own type");
            keyClick(Qt.Key_Left);
            keyClick(Qt.Key_Left);
            wait(250);
            compare(TvSettings.values.picture.contrast, "84", "Left writes \"84\"");
            // An unreadable value: the slider refuses to move, and nothing is written.
            TvSettings.values.picture.backlight = "n/a";
            TvSettings.notify("picture", "backlight");
            focusRow("Brightness");
            var n = TvSettings.calls.length;
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Left);
            wait(250);
            compare(TvSettings.calls.length, n, "an unreadable value is never written");
            compare(TvSettings.values.picture.backlight, "n/a");
            TvSettings.values.picture.backlight = "50";
            TvSettings.notify("picture", "backlight");
            TvSettings.values.picture.contrast = "85";
            part.menu.close();
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

        // The Look app's launch: openSettings {target: "Look"} lands on our Look page, which lists every installed style
        // and theme and marks the chosen ones.
        function test_3b_look_page() {
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "bubble", "themes": ["winter"] }, "style": { "id": "bubble", "tokens": {} },
                "themes": [], "settings": { "open": true, "target": "Look", "at": 6 },
                "available": { "styles": [{ "id": "smoke", "name": "Smoke" }, { "id": "bubble", "name": "Bubble" }],
                               "themes": [{ "id": "glow", "name": "Glow" }, { "id": "winter", "name": "Winter" }, { "id": "halloween", "name": "Halloween" }] } }));
            verify(part.menu.open, "openSettings Look opens our Settings");
            compare(topId(), "Look");
            ["Smoke", "Bubble", "Glow", "Winter", "Halloween"].forEach(function (n) { verify(rowNamed(n) >= 0, "the Look page lists " + n); });
            var l = rows();
            verify(l.rows[rowNamed("Bubble")].checked && !l.rows[rowNamed("Smoke")].checked, "the chosen style is marked");
            verify(l.rows[rowNamed("Winter")].on && !l.rows[rowNamed("Glow")].on, "the chosen theme is on");
            for (var i = 0; i < 4 && part.menu.open; i++) keyClick(Qt.Key_Escape);
            verify(!part.menu.open, "Back closes it");
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] }, "style": { "id": "smoke", "tokens": {} },
                                          "themes": [], "settings": { "open": false, "at": 7 } }));
        }

        // The Look page's seasonal themes: picked by hand, one at a time, or left to the service's calendar.
        function test_3c_look_seasonal() {
            function look(chosen, at) {
                Fixture.load(JSON.stringify({ "returnValue": true, "look": chosen, "style": { "id": "smoke", "tokens": {} }, "themes": [],
                    "settings": { "open": true, "target": "Look", "at": at },
                    "available": { "styles": [{ "id": "smoke", "name": "Smoke" }],
                        "themes": [{ "id": "glow", "name": "Glow", "group": "custom" },
                            { "id": "newyear", "name": "New Year", "group": "seasonal", "dates": [{ "from": "2026-12-26", "to": "2027-01-03" }] },
                            { "id": "autumn", "name": "Autumn", "group": "seasonal", "dates": [{ "from": "2026-09-23", "to": "2026-11-30" }], "inSeason": true },
                            { "id": "christmas", "name": "Christmas", "group": "seasonal", "dates": [{ "from": "2026-12-01", "to": "2026-12-25" }] }] } }));
            }
            function sent() { return Fixture.commands[Fixture.commands.length - 1]; }
            function labels() { var l = rows().rows, out = []; for (var i = 0; i < l.length; i++) out.push(l[i].section || l[i].label); return out; }

            look({ "style": "smoke", "themes": ["glow", "autumn"], "auto": false, "skip": [] }, 60);
            compare(topId(), "Look");
            compare(labels(), ["Style", "Smoke", "Seasonal themes", "Automatic", "None", "New Year", "Autumn", "Christmas", "Themes", "Glow"]);
            compare(specNamed("Autumn").variant, "radio");
            verify(specNamed("Autumn").checked && !specNamed("Christmas").checked && !specNamed("None").checked, "the theme picked by hand is marked");
            compare(specNamed("New Year").hint, "Dec 26 \u2013 Jan 3", "a row shows its dates");
            compare(specNamed("Christmas").hint, "Dec 1 \u2013 25");
            verify(!specNamed("Automatic").on && specNamed("Glow").on);

            down("Christmas");
            keyClick(Qt.Key_Return);
            compare(sent().method, "/setLook");
            compare(sent().params, { "themes": ["glow", "christmas"] }, "a seasonal theme takes the place of the one that was on");
            down("None");
            keyClick(Qt.Key_Return);
            compare(sent().params, { "themes": ["glow"] }, "None turns the seasonal theme off and leaves the others");
            down("Automatic");
            keyClick(Qt.Key_Return);
            compare(sent().params, { "auto": true });

            // The service's answer: the calendar has the themes now, and each row is that theme's place in it.
            look({ "style": "smoke", "themes": ["glow", "autumn"], "auto": true, "skip": ["christmas"] }, 60);
            compare(focused(), "Automatic", "focus stays on the switch");
            compare(labels(), ["Style", "Smoke", "Seasonal themes", "Automatic", "In the calendar", "New Year", "Autumn", "Christmas", "Themes", "Glow"]);
            verify(specNamed("Automatic").on);
            compare(specNamed("Automatic").hint, "On now: Autumn");
            compare(specNamed("Autumn").variant, "toggle");
            verify(specNamed("Autumn").on && specNamed("New Year").on && !specNamed("Christmas").on, "a theme left out of the calendar is off");
            compare(specNamed("Autumn").hint, "Sep 23 \u2013 Nov 30 \u00b7 On now");
            down("New Year");
            keyClick(Qt.Key_Return);
            compare(sent().params, { "skip": ["christmas", "newyear"] }, "OK takes a theme out of the calendar");
            down("Christmas");
            keyClick(Qt.Key_Return);
            compare(sent().params, { "skip": [] }, "and puts one back");
            down("Automatic");
            keyClick(Qt.Key_Return);
            compare(sent().params, { "auto": false });

            for (var i = 0; i < 4 && part.menu.open; i++) keyClick(Qt.Key_Escape);
            Fixture.load(JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] }, "style": { "id": "smoke", "tokens": {} },
                                          "themes": [], "settings": { "open": false, "at": 61 } }));
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
            // The write goes out on the store's flush (writes are paced), so wait for it rather than racing it.
            tryCompare(TvSettings, "volume", 22, 2000, "Right steps the volume, once the store flushes its paced write");
            compare(Object.keys(part.store.queued).length, 0, "nothing left queued after the flush");
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

        function test_8a_wifi_password_and_join() {
            // The boards' TV: Wi-Fi off, one device paired; Bluetooth surround greys only with none paired.
            openSettings("connection", 9);
            compare(specNamed("Wi-Fi").value, "Off", "Connection's Wi-Fi row reads Wi-Fi's own state");
            compare(specNamed("Bluetooth devices").value, "1 paired", "and Bluetooth devices the paired count");
            // These steps need Wi-Fi on, with the home network joined.
            TvSettings.wifiState = "serviceEnabled";
            openSettings("wifi", 10);
            compare(topId(), "Wifi", "the wifi page id opens our Wi-Fi page");
            compare(part.menu.stack[0].id, "Network");
            verify(called("/findnetworks") !== null, "the page scans while it shows");
            compare(specNamed("Home").value, "Connected");
            compare(part.store.state("wifiEnabled").label, "On", "Wi-Fi's state, for other pages");
            down("Garage");
            keyClick(Qt.Key_Return);
            verify(part.menu.editing !== null, "OK on a secured network asks for its password");
            wait(50);
            compare(part.menu.entry.keyboard.rows[3][2].label, "Join", "the keyboard's finishing key says Join");
            var calls = TvSettings.calls.length;
            goKey("Join");
            verify(part.menu.editing !== null, "Join waits for 8 characters");
            typeText("wrench1");
            goKey("Join");
            verify(part.menu.editing !== null, "and 7 are not enough");
            typeText("3");
            compare(part.menu.entry.text, "wrench13", "typed with the D-pad");
            compare(part.menu.entry.field.shown, "\u2022\u2022\u2022\u2022\u2022\u2022\u20223", "shown as dots but the last");
            compare(TvSettings.calls.length, calls, "typing calls nothing");
            goKey("Delete");
            typeText("a");
            goKey("Delete");
            typeText("3");
            goKey("Join");
            verify(part.menu.editing === null, "Join closes the keyboard");
            compare(called("/connect").security.simpleSecurity.passKey, "wrench13", "and joins with the password");
            compare(specNamed("Garage").value, "", "a wrong password is rolled back");
            compare(specNamed("Home").value, "Connected", "and the network the TV was on stays");
            verify(toasted("Not joined Garage: the password is wrong"), "with a toast that says why");
            wait(50);
            compare(focused(), "Garage", "focus stays on the network");
            keyClick(Qt.Key_Return);
            wait(50);
            compare(part.menu.entry.text, "", "the keyboard opens empty again");
            typeText("wrench12");
            goKey("Join");
            compare(specNamed("Garage").value, "Connected", "the right password joins");
            verify(specNamed("Garage").current, "and marks it current");
            compare(specNamed("Home").value, "Saved", "the old network is saved, not connected");
            verify(toasted("Joined Garage"));
            wait(50);
            // Back out of the keyboard: nothing is sent.
            down("Neighbour 5G");
            keyClick(Qt.Key_Return);
            wait(50);
            typeText("abc");
            calls = TvSettings.calls.length;
            keyClick(Qt.Key_Escape);
            verify(part.menu.editing === null, "Back closes the keyboard");
            compare(TvSettings.calls.length, calls, "and joins nothing");
            wait(50);
            compare(focused(), "Neighbour 5G");
        }

        function test_8b_wifi_confirm_timeout_and_forget() {
            part.store.joinTimeout = 300;
            down("Upstairs");
            keyClick(Qt.Key_Return);
            compare(part.menu.dialog.buttons.join(), "Cancel,Forget,Join", "a saved network asks: forget or join");
            compare(part.menu.dialog.currentIndex, 0, "the safe button has focus");
            wait(50);
            TvSettings.silent["wifi.connect"] = true;
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Return);
            compare(specNamed("Upstairs").value, "Joining", "joining shows at once");
            verify(specNamed("Upstairs").busy, "with the busy ring");
            wait(700);
            compare(specNamed("Upstairs").value, "Saved", "no answer: rolled back");
            compare(specNamed("Garage").value, "Connected", "the current network is back too");
            verify(toasted("Not joined Upstairs: the TV did not answer"));
            delete TvSettings.silent["wifi.connect"];
            part.store.joinTimeout = 30000;
            down("Garage");
            keyClick(Qt.Key_Return);
            compare(part.menu.dialog.buttons.join(), "Cancel,Forget");
            wait(50);
            keyClick(Qt.Key_Return);
            compare(called("/deleteprofile"), null, "Cancel forgets nothing");
            keyClick(Qt.Key_Return);
            wait(50);
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Return);
            verify(called("/deleteprofile") !== null, "Forget deletes its profile");
            compare(specNamed("Garage").value, "", "and it moves to Nearby");
            // Wi-Fi off asks first.
            down("Wi-Fi");
            keyClick(Qt.Key_Return);
            compare(part.menu.dialog.title, "Wi-Fi", "turning Wi-Fi off asks first");
            wait(50);
            keyClick(Qt.Key_Escape);
            compare(TvSettings.wifiState, "serviceEnabled", "Back keeps it on");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Network", "Back leaves the Wi-Fi page");
        }

        function test_8c_bluetooth_pair_and_disconnect() {
            TvSettings.btPair("Kitchen speaker", "00:00:5E:00:53:02", false);
            openSettings("bluetooth", 11);
            compare(topId(), "Bluetooth");
            compare(part.menu.stack[0].id, "Network", "under Connection, as the board has it");
            compare(specNamed("Living room soundbar").value, "Connected");
            compare(part.store.state("btPairedCount").label, "2 paired", "the paired count, for other pages: audio only, not the remote");
            compare(specNamed("LGE MR19"), null, "the magic remote is never listed");
            compare(called("/getPairedDevices"), null, "btaudiosrc's paired list (unanswered on the TV) is not read");
            verify(called("/device/getStatus") !== null, "bluetooth2's device status is");
            // The hard rule: whatever asks, the remote is never forgotten or disconnected.
            var remote = { "address": "00:00:5E:00:53:0A", "name": "LGE MR19", "type": "ble", "classOfDevice": 7936, "paired": true, "status": "connected" };
            var n = TvSettings.calls.length;
            part.store.btForget(remote);
            part.store.btDisconnect(remote);
            part.store.btForget({ "address": "00:00:5E:00:53:0B", "name": "Remote", "typeOfDevice": "ble", "classOfDevice": 1344 });
            compare(TvSettings.calls.length, n + 3, "no Bluetooth call for the remote; only the three refusal toasts");
            verify(toasted("Not forgotten: that is the TV's remote"));
            verify(TvSettings.device("00:00:5E:00:53:0A") !== null, "the remote stays paired");
            compare(called("/startDiscovery"), null, "no search until asked");
            down("Search for devices");
            keyClick(Qt.Key_Return);
            verify(called("/startDiscovery") !== null, "OK searches");
            verify(specNamed("Headphones") !== null, "and what it finds is listed under Nearby");
            verify(specNamed("Searching for devices").busy);
            down("Headphones");
            keyClick(Qt.Key_Return);
            compare(part.menu.dialog.title, "Pair Headphones?", "pairing asks first");
            wait(50);
            TvSettings.fail["bt.connect"] = true;
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Return);
            verify(toasted("Not paired with Headphones: Pairing failed"), "a refused pairing says so");
            compare(specNamed("Headphones").value, "", "and is rolled back");
            wait(50);
            down("Headphones");
            keyClick(Qt.Key_Return);
            wait(50);
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Return);
            compare(called("/connect").address, "00:00:5E:00:53:03");
            compare(specNamed("Headphones").value, "Connected", "paired and connected");
            compare(specNamed("Living room soundbar").value, "Not connected", "the soundbar lets go");
            verify(toasted("Paired Headphones"));
            compare(part.store.values.btPairedCount, 3);
            wait(50);
            down("Headphones");
            keyClick(Qt.Key_Return);
            compare(part.menu.dialog.buttons.join(), "Cancel,Forget,Disconnect");
            wait(50);
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Right);
            keyClick(Qt.Key_Return);
            compare(called("/disconnect").address, "00:00:5E:00:53:03");
            compare(specNamed("Headphones").value, "Not connected", "disconnected");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Network", "Back leaves the page");
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            verify(!part.menu.open);
            compare(part.store.busy("btDevices"), false, "closing stops the search");
        }

        function test_8d_pin_wrong_right_and_change() {
            openSettings("pin", 12);
            compare(topId(), "Safety");
            compare(focused(), "Locks");
            keyClick(Qt.Key_Return);
            verify(part.menu.pinning !== null, "a locked row asks for the PIN");
            wait(50);
            keyClick(Qt.Key_1); keyClick(Qt.Key_2); keyClick(Qt.Key_3); keyClick(Qt.Key_4);
            compare(part.menu.pin.error, "Wrong PIN. Try again.", "a wrong PIN says so");
            compare(part.menu.pin.pin, "", "and clears");
            compare(TvSettings.values.lock.parentalControl, false, "and changes nothing");
            for (var i = 0; i < 4; i++) padTo("0");
            verify(part.menu.pinning === null, "the right PIN, by the D-pad, closes the prompt");
            compare(TvSettings.values.lock.parentalControl, true, "and does what was asked");
            wait(50);
            down("Change PIN");
            keyClick(Qt.Key_Return);
            compare(part.menu.pinning.mode, "new", "unlocked: no PIN asked again, straight to a new one");
            wait(50);
            keyClick(Qt.Key_1); keyClick(Qt.Key_1); keyClick(Qt.Key_1); keyClick(Qt.Key_1);
            compare(part.menu.pinning.mode, "again");
            keyClick(Qt.Key_2); keyClick(Qt.Key_2); keyClick(Qt.Key_2); keyClick(Qt.Key_2);
            compare(part.menu.pinning.mode, "new", "two that differ start again");
            verify(part.menu.pin.error.length > 0);
            keyClick(Qt.Key_Escape);
            verify(part.menu.pinning === null, "Back leaves the PIN prompt");
            compare(TvSettings.values.lock.systemPin, "0000", "and the PIN is unchanged");
            wait(50);
            keyClick(Qt.Key_Return);
            wait(50);
            keyClick(Qt.Key_1); keyClick(Qt.Key_3); keyClick(Qt.Key_5); keyClick(Qt.Key_7);
            keyClick(Qt.Key_1); keyClick(Qt.Key_3); keyClick(Qt.Key_5); keyClick(Qt.Key_7);
            verify(part.menu.pinning === null);
            compare(TvSettings.values.lock.systemPin, "1357", "the new PIN is written");
            compare(called("/setSystemSettings", "systemPin").settings.initialPinCode, false, "as the household's own");
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            verify(!part.menu.open);
            verify(!part.store.unlocked, "closing locks it again");
            openSettings("pin", 13);
            verify(specNamed("Locks").locked, "the next visit asks again");
            keyClick(Qt.Key_Return);
            wait(50);
            keyClick(Qt.Key_Escape);
            verify(part.menu.pinning === null);
            compare(TvSettings.values.lock.parentalControl, true, "Back out of the PIN changes nothing");
        }

        function test_8e_text_entry() {
            openSettings("keyboard-input", 14);
            compare(topId(), "KeyboardInput");
            compare(specNamed("TV name").value, "Living room TV");
            verify(specNamed("Keyboard languages").disabled, "an unbuilt row is disabled, with its reason");
            down("TV name");
            keyClick(Qt.Key_Return);
            wait(50);
            compare(part.menu.entry.text, "Living room TV", "the keyboard starts from the name");
            goKey("Delete");
            goKey("Delete");
            goKey("Shift");
            typeText("Den");
            compare(part.menu.entry.text, "Living room Den", "Shift gives one capital");
            goKey("Done");
            compare(TvSettings.values.network.deviceName, "Living room Den", "Done writes it");
            compare(specNamed("TV name").value, "Living room Den");
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            verify(!part.menu.open);
        }

        function test_8f_pin_gate_layouts_backspace_and_none_paired() {
            // The PIN is not kept once Settings closes (8d closed it).
            compare(part.store.values["lock.systemPin"], undefined, "the PIN is gone after close");
            // A page under Safety reached straight by its id asks for the PIN before it shows anything.
            openSettings("RatingLocks", 20);
            compare(topId(), "RatingLocks");
            verify(part.menu.pinning !== null && part.menu.pinning.mode === "page", "a direct target to a lock page asks for the PIN");
            compare(rows().rows.length, 0, "and shows no rows meanwhile");
            wait(50);
            keyClick(Qt.Key_1); keyClick(Qt.Key_2);
            keyClick(Qt.Key_Backspace);
            compare(part.menu.pin.pin, "1", "Backspace erases a PIN digit");
            verify(part.menu.pinning !== null, "and does not close the prompt");
            keyClick(Qt.Key_Escape);
            verify(part.menu.pinning === null);
            compare(topId(), "Safety", "Back from the PIN leaves the locked page");
            openSettings("InputLocks", 21);
            verify(part.menu.pinning !== null, "every lock page asks");
            wait(50);
            keyClick(Qt.Key_1); keyClick(Qt.Key_3); keyClick(Qt.Key_5); keyClick(Qt.Key_7);
            verify(part.menu.pinning === null, "the right PIN opens it");
            compare(topId(), "InputLocks");
            verify(rows().rows.length > 0, "with its rows");
            keyClick(Qt.Key_Escape);
            compare(topId(), "Safety");
            // A ZIP code opens the keyboard on its digits.
            openSettings("Location", 22);
            var at = specOf("zipcode");
            verify(at >= 0, "the ZIP code row");
            rows().currentIndex = at;
            keyClick(Qt.Key_Return);
            wait(50);
            compare(part.menu.entry.keyboard.layout, "symbols", "the ZIP code opens on the digits");
            keyClick(Qt.Key_1); keyClick(Qt.Key_2);
            keyClick(Qt.Key_Backspace);
            compare(part.menu.entry.text, "1", "Backspace erases on the keyboard");
            verify(part.menu.editing !== null, "and does not close it");
            keyClick(Qt.Key_Escape);
            verify(part.menu.editing === null, "the remote's Back closes it");
            wait(50);
            openSettings("keyboard-input", 23);
            down("TV name");
            keyClick(Qt.Key_Return);
            wait(50);
            compare(part.menu.entry.keyboard.layout, "letters", "a name opens on the letters");
            keyClick(Qt.Key_Escape);
            // Nothing paired: Bluetooth surround waits for a speaker, Connection says so.
            // Only the magic remote stays paired: it does not count as a speaker.
            TvSettings.btDevices = [TvSettings.device("00:00:5E:00:53:0A")];
            openSettings("sound", 24);
            verify(specNamed("Bluetooth surround").disabled, "Bluetooth surround is greyed with nothing paired");
            compare(specNamed("Bluetooth surround").hint, "Pair a Bluetooth speaker first");
            openSettings("connection", 25);
            compare(specNamed("Bluetooth devices").value, "None paired");
            part.closeAll();
            compare(part.store.values["lock.systemPin"], undefined, "and the PIN is gone again");
        }

        // The probe the TV suite reads (Layer.qml publishes it): open pages, focus and the kind of row it is on, prompts.
        function test_8z_probe() {
            part.closeAll();
            compare(part.probe.menu.open, false);
            compare(part.probe.quick.open, false);
            SettingsBus.quickSettingsRequested(null);
            compare(part.probe.quick.open, true);
            compare(part.probe.quick.stack.join(), "quick");
            compare(part.probe.quick.focus.label, "Picture mode");
            compare(part.probe.quick.focus.variant, "value");
            keyClick(Qt.Key_Return);
            compare(part.probe.quick.stack.join(), "quick,pick:pictureMode", "a picker is a page on the stack");
            compare(part.probe.quick.focus.kind, "choose");
            keyClick(Qt.Key_Escape);
            keyClick(Qt.Key_Escape);
            compare(part.probe.quick.open, false);
            openSettings("", 40);
            compare(part.probe.menu.area, "categories");
            compare(part.probe.menu.focus.category, "picture");
            openSettings("keyboard-input", 41);
            compare(part.probe.menu.stack[part.probe.menu.stack.length - 1], "KeyboardInput");
            down("TV name");
            compare(part.probe.menu.focus.kind, "text");
            keyClick(Qt.Key_Return);
            compare(part.probe.menu.editing.label, "TV name", "the keyboard is up");
            compare(part.probe.menu.editing.keys[0][0], "q", "with its grid");
            compare(part.probe.menu.editing.row, 0);
            compare(part.probe.menu.editing.text, part.menu.entry.text, "and its text");
            keyClick(Qt.Key_Escape);
            compare(part.probe.menu.editing, null, "Back closed it");
            openSettings("RatingLocks", 42);
            compare(part.probe.menu.pin.mode, "page", "a locked page asks for the PIN");
            compare(part.probe.menu.pin.length, 0);
            keyClick(Qt.Key_Return);
            compare(part.probe.menu.pin.length, 1, "OK on the pad types its digit");
            compare(part.probe.menu.pin.pad, 0);
            keyClick(Qt.Key_Escape);
            compare(part.probe.menu.pin, null, "Back closed the prompt");
            part.closeAll();
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
