import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import "../../ui/Look" as Ours

// Inject.qml against a fake LG root: LG's system UI container loads it, it creates the layer under the root and asks
// to be unloaded; the layer must keep working after that, a second injection must replace it, and one whose layer
// does not compile must leave the loaded one. A layer replaced while one of its menus is open (in LG's popup plane, not
// under the layer) must still give everything back before the new one starts. Prints each step and exits 1 on the
// first failure:
//   qml Inject.qml -- <a copy of ui/ whose Look/Layer.qml does not compile>
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
            // LG's system UI table; Hook A swaps the Quick Settings entry for ours.
            property var config: ({ "appinfo": [{ "id": "com.webos.app.quicksettings", "main": "file:///lg/QuickSettings.qml" }] })
        }
        Item { Item { id: overlayView } }
        // configd's key filter list and the compositor's live chain, bound to it until assigned.
        property var systemSettings: QtObject { property var keyFilters: [{ "handler": "handleSystemKeys", "file": "/lg/systemUi.js" }] }
        property var keyFilter: QtObject { signal backReleased(); property var keyFilters: host.systemSettings.keyFilters }
        // LG's popup plane (layer 6): our open menus live in it.
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
    // Stands in for an LG item a part holds.
    Item { id: stand }

    Component {
        id: containerType
        // StarfishSystemUIContainer: loads `main` with itself as the parent and tells it the overlay's life cycle.
        Item {
            id: box
            property bool exited: false
            signal lifeCycleStatusChanged(var payload)
            function windowExit() { exited = true; }
            function load(url) { loader.setSource(url, { "parent": box }); }
            Loader { id: loader }
        }
    }

    // A copy of ui/ with a Layer.qml that does not compile.
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
    // The probes one layer sent after the first `from` commands (a probe names its layer by `instance`).
    function probesFrom(instance, from) {
        var n = 0;
        for (var i = from; i < Fixture.commands.length; i++)
            if (Fixture.commands[i].method === "/setProbe" && Fixture.commands[i].params.layer === instance) n++;
        return n;
    }
    // How many Home key filters of ours are in the live chain.
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
            launch();
            check(layers().length === 1 && layers()[0].host === host, "injected: one layer under LG's root, with it as host");
            check(reports("ready", "layer created by injection") === 1, "injected: reported ready");
            check(gearOpensOurs(), "injected: the gear opens our quick sheet");
            check(container.exited, "injected: the injector asked its container to unload it");
            container.destroy();
        },
        function () {
            gc();
            check(layers().length === 1 && layers()[0].waiting.length > 0, "injector unloaded: the layer and its parts are still there");
            // A waiting part is visible through a binding on what it holds. Bindings stop when the context their
            // object was created in is destroyed, so this one tells whether the layer depends on the injector.
            var part = layers()[0].waiting[0].part;
            check(!part.visible, "injector unloaded: a waiting part holds nothing and is hidden");
            part.lg = stand;
            check(part.visible, "injector unloaded: the layer's bindings still work");
            part.lg = null;
            // The layer answers the Look service's probing switch from a handler in its own file.
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": true }));
        },
        function () {
            check(probesSent() > 0, "injector unloaded: the layer's own handlers still run");
            check(homeFilters() === 1, "injected: the Home key filter is in LG's chain");
            var first = layers()[0];
            // Replaced while the Home dock is open: the dock sits in LG's popup plane, not under the layer.
            Ours.SettingsBus.homeRequested(null);
            check(plane.children.length === 1, "the Home dock is open, in LG's popup plane");
            launch();
            check(!plane.visible && plane.children.length === 0, "injected again: the old dock closed and gave the plane back");
            check(layers().length === 1 && layers()[0] !== first, "injected again: one layer under LG's root, a new one");
            check(reports("ready", "layer created by injection") === 2, "injected again: reported ready again");
            // The replaced layer is not destroyed yet, and must already have let go of everything that outlives it.
            // On the TV a function of a destroyed layer that is still connected is still called, in a context that is
            // gone, and the compositor crashes on the first singleton it names.
            var sent = Fixture.commands.length;
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": false }));
            Fixture.load(JSON.stringify({ "returnValue": true, "probing": true }));
            check(probesFrom(layers()[0].instance, sent) > 0, "injected again: the new layer answers the probing switch");
            check(probesFrom(first.instance, sent) === 0, "injected again: the replaced layer no longer answers it");
            check(container.exited, "injected again: the injector asked to be unloaded");
            container.destroy();
        },
        function () {
            // The replaced layer is destroyed by now; what it undoes must not reach the new one.
            check(gearOpensOurs(), "injected again: the gear still opens our quick sheet once the old layer is destroyed");
            check(homeFilters() === 1, "injected again: one Home key filter in the chain once the old layer is destroyed");
            // Replaced while our Settings is open.
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
