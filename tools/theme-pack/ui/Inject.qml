import QtQuick 2.4
import "Look"
import "inject.js" as Inject

// Puts our layer into the compositor that is already running, with no restart. LG's system UI manager loads this file
// as an overlay (luna://com.webos.service.systemUIManager/launch with this file as `main`); it finds LG's root above
// itself, creates Look/Layer.qml under it and asks its container to unload it again. Nothing is drawn here.
// The compositor keeps every QML file it has loaded, by path, so a changed layer has to come from a new path
// (own-layer.sh loads a fresh copy of ui/ each time).
Item {
    id: injector
    property bool done: false

    // LG's root is the ancestor that holds the system UI manager.
    function lgRoot() {
        for (var p = injector.parent; p; p = p.parent) {
            var k = p.children;
            for (var i = 0; i < k.length; i++) if (k[i].objectName === "systemUIManager") return p;
        }
        return null;
    }
    function loaded(host) {
        var k = host.children;
        for (var i = 0; i < k.length; i++) if (k[i].objectName === "themepackLayer") return k[i];
        return null;
    }
    function inject() {
        var host = lgRoot();
        if (!host) { Look.report("error", "inject: LG's root was not found above the overlay"); return; }
        // A layer that does not compile leaves the loaded one running.
        var ready = Inject.prepare(Qt.resolvedUrl("Look/Layer.qml"), host);
        if (ready.error) { Look.report("error", "inject: " + ready.error); return; }
        // The loaded layer makes way for this one.
        var old = loaded(host);
        if (old) {
            // An older layer may not know how to retire; it is destroyed all the same.
            try { old.retire(); } catch (e) { Look.report("gap", "inject: the old layer could not hand LG's items back: " + e); }
            // Out of LG's tree at once, so the new layer's parts cannot find anything in it.
            old.objectName = "";
            old.parent = null;
            old.destroy();
        }
        var made = Inject.create(ready.component, host);
        Look.report(made.error ? "error" : "ready", made.error ? "inject: " + made.error : "layer created by injection");
    }
    function finish() {
        if (done) return;
        done = true;
        if (parent && typeof parent.windowExit === "function") parent.windowExit();
    }
    // LG's container says "launch" once the overlay is registered; it can be closed from then on.
    function lifeCycle(payload) { if (payload && payload.event === "launch") finish(); }
    Timer { interval: 5000; running: true; onTriggered: injector.finish() }

    Component.onCompleted: {
        if (parent && parent.lifeCycleStatusChanged !== undefined) parent.lifeCycleStatusChanged.connect(injector.lifeCycle);
        inject();
    }
}
