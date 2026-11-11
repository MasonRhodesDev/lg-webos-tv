import QtQuick 2.4
import WebOSServices 1.0
import ".."

// What LG's system UI manager loads for our own entry, dev.themepack.home (SystemUiHook.qml's `extra`). The Home key's
// filter (ui/home-key.js) launches it. It draws nothing: each launch is handed to the Home dock (parts/Home.qml)
// through SettingsBus, and the window exits at once. A preload only exits.
//
// If no dock is listening (the part is gone, or this file was loaded in an engine that does not share our SettingsBus),
// Home must still open something, so this launch opens LG's Home.
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
        parent.lifeCycleStatusChanged.connect(entry.lifeCycle);
    }
}
