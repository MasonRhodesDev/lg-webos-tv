import QtQuick 2.4
import "Look"
import "inject.js" as Inject

Item {
    id: injector
    property bool done: false

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
        var ready = Inject.prepare(Qt.resolvedUrl("Look/Layer.qml"), host);
        if (ready.error) { Look.report("error", "inject: " + ready.error); return; }
        var old = loaded(host);
        if (old) {
            try { old.retire(); } catch (e) { Look.report("gap", "inject: the old layer could not hand LG's items back: " + e); }
            old.objectName = "";
            old.parent = null;
            if (typeof old.unlink === "function") old.destroy();
            else Look.report("gap", "inject: the old layer cannot disconnect itself; left alive, out of sight");
        }
        var made = Inject.create(ready.component, host);
        Look.report(made.error ? "error" : "ready", made.error ? "inject: " + made.error : "layer created by injection");
    }
    function finish() {
        if (done) return;
        done = true;
        if (parent && typeof parent.windowExit === "function") parent.windowExit();
    }
    function lifeCycle(payload) { if (payload && payload.event === "launch") finish(); }
    Timer { interval: 5000; running: true; onTriggered: injector.finish() }

    property Item box: null
    Component.onCompleted: {
        if (parent && parent.lifeCycleStatusChanged !== undefined) {
            box = parent;
            box.lifeCycleStatusChanged.connect(injector.lifeCycle);
        }
        inject();
    }
    Component.onDestruction: { try { if (box) box.lifeCycleStatusChanged.disconnect(injector.lifeCycle); } catch (e) { } }
}
