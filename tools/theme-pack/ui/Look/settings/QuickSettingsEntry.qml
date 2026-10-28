import QtQuick 2.4
import Look 1.0

// Hook A's window (SystemUiHook.qml): what LG's system UI table now loads for Quick Settings. It draws nothing. Each
// launch is handed to our Settings host through SettingsBus, and the window exits at once, so LG's overlay never
// shows and our host keeps its own focus. A boot preload only exits, as LG's own Quick Settings does.
//
// LG's container (StarfishSystemUIContainer) is this item's parent; the calls below are the ones LG's
// StarfishSystemUIWindow makes on it. Unverified on the TV (TV-CHECKS.md, Settings core).
FocusScope {
    id: entry
    anchors.fill: parent

    function lifeCycle(payload) {
        if (!payload) return;
        if (payload.event === "launch" && payload.reason !== "preload") SettingsBus.quickSettingsRequested(payload.params || null);
        if (payload.event === "launch" || payload.event === "close") parent.windowExit();
    }

    Component.onCompleted: {
        if (!parent || parent.lifeCycleStatusChanged === undefined) {
            Look.report("error", "settings: Quick Settings entry loaded outside LG's system UI container");
            return;
        }
        if (!SettingsBus.ready) Look.report("error", "settings: Quick Settings entry launched with no host listening");
        parent.lifeCycleStatusChanged.connect(entry.lifeCycle);
    }
}
