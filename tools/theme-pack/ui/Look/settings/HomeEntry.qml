import QtQuick 2.4
import WebOSServices 1.0
import ".."

FocusScope {
    id: entry
    anchors.fill: parent

    property var bus: Service { appId: Look.busName }

    function lifeCycle(payload) {
        if (!payload) return;
        var real = payload.event === "launch" && payload.reason !== "preload";
        if (real && SettingsBus.homeReady) SettingsBus.homeRequested(payload.params || null);
        else if (real) lgHome();
        if (payload.event === "launch" || payload.event === "close") parent.windowExit();
    }

    function lgHome() {
        Look.report("error", "home: the Home key reached our entry with no dock listening; opened LG's Home");
        bus.call("luna://com.webos.applicationManager", "/launch",
                 JSON.stringify({ "id": "com.webos.app.home", "params": { "category": "home" } }));
    }

    Component.onCompleted: {
        if (!parent || parent.lifeCycleStatusChanged === undefined) {
            Look.report("error", "home: entry loaded outside LG's system UI container");
            return;
        }
        box = parent;
        box.lifeCycleStatusChanged.connect(entry.lifeCycle);
    }
    property Item box: null
    Component.onDestruction: { try { if (box) box.lifeCycleStatusChanged.disconnect(entry.lifeCycle); } catch (e) { } }
}
