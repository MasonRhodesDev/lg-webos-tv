import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import "../../ui/Look" as Ours

Window {
    id: win
    width: 1920; height: 1080
    visible: true

    Item {
        id: host
        anchors.fill: parent
        Item {
            id: manager
            objectName: "systemUIManager"
            property var config: ({ "appinfo": [{ "id": "com.webos.app.quicksettings", "main": "file:///lg/QuickSettings.qml" }] })
        }
        Item { Item { id: overlayView } }
        property var systemSettings: QtObject { property var keyFilters: [{ "handler": "handleSystemKeys", "file": "/lg/systemUi.js" }] }
        property var keyFilter: QtObject { signal backReleased(); property var keyFilters: host.systemSettings.keyFilters }
        Item {
            id: plane
            anchors.fill: parent
            property var backKeyFilter: null
            property var currentView: null
            property int layerNumber: 6
            property var model: ListModel { }
            visible: false
        }
    }
    Item { id: stand }

    Component {
        id: containerType
        Item {
            id: box
            property bool exited: false
            signal lifeCycleStatusChanged(var payload)
            function windowExit() { exited = true; }
            function load(url) { loader.setSource(url, { "parent": box }); }
            Loader { id: loader }
        }
    }

    Component {
        id: olderType
        Item {
            objectName: "themepackLayer"
            property bool retired: false
            function retire() { retired = true; }
            Component.onDestruction: win.olderDestroyed = true
        }
    }
    property Item older: null
    property bool olderDestroyed: false
    property bool firstDestroyed: false

    readonly property string brokenUi: Qt.application.arguments[Qt.application.arguments.indexOf("--") + 1]
    property var container: null
    property int step: 0

    function layers() {
        var found = [];
        for (var i = 0; i < host.children.length; i++) if (host.children[i].objectName === "themepackLayer") found.push(host.children[i]);
        return found;
    }
    function reports(kind, text) {
        var n = 0;
        for (var i = 0; i < Fixture.reports.length; i++)
            if (Fixture.reports[i].kind === kind && Fixture.reports[i].text.indexOf(text) >= 0) n++;
        return n;
    }
    function probesSent() {
        var n = 0;
        for (var i = 0; i < Fixture.commands.length; i++) if (Fixture.commands[i].method === "/setProbe") n++;
        return n;
    }
    function probesFrom(instance, from) {
        var n = 0;
        for (var i = from; i < Fixture.commands.length; i++)
            if (Fixture.commands[i].method === "/setProbe" && Fixture.commands[i].params.layer === instance) n++;
        return n;
    }
    function homeFilters() {
        var list = host.keyFilter.keyFilters, n = 0;
        for (var i = 0; i < list.length; i++) if (list[i].handler === "themepackHandleHome") n++;
        return n;
    }
    function gearOpensOurs() { return /QuickSettingsEntry\.qml$/.test(manager.config.appinfo[0].main) && Ours.SettingsBus.ready; }
    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) { Qt.exit(1); throw new Error("inject: failed"); }
    }
    function launch(ui) {
        container = containerType.createObject(overlayView);
        container.load(ui ? "file://" + ui + "/Inject.qml" : Qt.resolvedUrl("../../ui/Inject.qml"));
        container.lifeCycleStatusChanged({ "event": "register" });
        check(!container.exited, "the injector stays until LG says the overlay is launched");
        container.lifeCycleStatusChanged({ "event": "launch" });
    }

    readonly property var steps: [
        function () {
            check(layers().length === 0, "startup: no layer under LG's root");
            older = olderType.createObject(host);
            launch();
            check(older.retired && older.parent === null, "injected over an older layer: the older one retired and left LG's tree");
            check(reports("gap", "the old layer cannot disconnect itself") === 1, "injected over an older layer: reported as left alive");
            check(layers().length === 1 && layers()[0].host === host, "injected: one layer under LG's root, with it as host");
            check(reports("ready", "layer created by injection") === 1, "injected: reported ready");
            check(gearOpensOurs(), "injected: the gear opens our quick sheet");
            check(container.exited, "injected: the injector asked its container to unload it");
            container.destroy();
        },
        function () {
            gc();
            check(!olderDestroyed && older.retired, "injector unloaded: the older layer, which cannot disconnect itself, is still alive");
            check(layers().length === 1 && layers()[0].waiting.length > 0, "injector unloaded: the layer and its parts are still there");
            var part = layers()[0].waiting[0].part;
            check(!part.visible, "injector unloaded: a waiting part holds nothing and is hidden");
            part.lg = stand;
            check(part.visible, "injector unloaded: the layer's bindings still work");
            part.lg = null;
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": true }));
        },
        function () {
            check(probesSent() > 0, "injector unloaded: the layer's own handlers still run");
            check(homeFilters() === 1, "injected: the Home key filter is in LG's chain");
            var first = layers()[0];
            first.Component.destruction.connect(function () { win.firstDestroyed = true; });
            Ours.SettingsBus.homeRequested(null);
            check(plane.children.length === 1, "the Home dock is open, in LG's popup plane");
            launch();
            check(!plane.visible && plane.children.length === 0, "injected again: the old dock closed and gave the plane back");
            check(layers().length === 1 && layers()[0] !== first, "injected again: one layer under LG's root, a new one");
            check(reports("ready", "layer created by injection") === 2, "injected again: reported ready again");
            var sent = Fixture.commands.length;
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": false }));
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": true }));
            check(probesFrom(layers()[0].instance, sent) > 0, "injected again: the new layer answers the probing switch");
            check(probesFrom(first.instance, sent) === 0, "injected again: the replaced layer no longer answers it");
            check(container.exited, "injected again: the injector asked to be unloaded");
            container.destroy();
        },
        function () {
            check(firstDestroyed && !olderDestroyed, "injected again: the replaced layer, which disconnected itself, is destroyed");
            check(reports("gap", "the old layer cannot disconnect itself") === 1, "injected again: only the older layer was left alive");
            check(gearOpensOurs(), "injected again: the gear still opens our quick sheet once the old layer is destroyed");
            check(homeFilters() === 1, "injected again: one Home key filter in the chain once the old layer is destroyed");
            Ours.Look.settingsRequested("");
            check(plane.children.length === 1, "our Settings is open, in LG's popup plane");
            launch();
            container.destroy();
        },
        function () {
            check(gearOpensOurs(), "injected with Settings open: the gear opens our quick sheet once the old layer is destroyed");
            check(homeFilters() === 1, "injected with Settings open: one Home key filter in the chain");
            check(!plane.visible && plane.children.length === 0, "injected with Settings open: the plane given back");
            var second = layers()[0];
            launch(brokenUi);
            check(reports("error", "inject: ") === 1, "broken layer injected: the error is reported");
            check(homeFilters() === 1, "broken layer injected: the Home key filter stays");
            check(layers().length === 1 && layers()[0] === second && second.host === host, "broken layer injected: the loaded layer stays");
            check(reports("ready", "layer created by injection") === 3, "broken layer injected: nothing reported ready");
            check(gearOpensOurs(), "broken layer injected: the gear still opens our quick sheet");
            check(container.exited, "broken layer injected: the injector asked to be unloaded");
            console.log("inject: all passed");
            Qt.quit();
        }
    ]

    Timer {
        interval: 100
        repeat: true
        running: true
        onTriggered: { if (win.step < win.steps.length) win.steps[win.step++](); }
    }
}
