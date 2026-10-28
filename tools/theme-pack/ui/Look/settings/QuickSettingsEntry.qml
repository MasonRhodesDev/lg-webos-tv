import QtQuick 2.4
import Look 1.0

// Hook A's window (SystemUiHook.qml): what LG's system UI table now loads for Quick Settings. It draws nothing. Each
// launch is handed to our Settings host through SettingsBus, and the window exits at once, so LG's overlay never
// shows and our host keeps its own focus. A boot preload only exits, as LG's own Quick Settings does.
//
// If no host is listening (the layer's part is gone, or this file was loaded in an engine that does not share our
// SettingsBus), the gear must still open something: LG's table is restored for later launches, and this launch is
// handed to LG's own Quick Settings, loaded into this same container.
//
// LG's container (StarfishSystemUIContainer) is this item's parent; the calls below are the ones LG's
// StarfishSystemUIWindow makes on it. Unverified on the TV (TV-CHECKS.md, Settings core).
FocusScope {
    id: entry
    anchors.fill: parent
    // LG's own Quick Settings, when SettingsBus does not know it (an engine that does not share it).
    readonly property string lgDefault: "file:///usr/lib/qt5/qml/QuickSettings/QuickSettings.qml"
    property var lg: null

    function lifeCycle(payload) {
        if (!payload || lg) return;
        if (payload.event === "launch" && payload.reason !== "preload" && !SettingsBus.ready) { handToLg(payload); return; }
        if (payload.event === "launch" && payload.reason !== "preload") SettingsBus.quickSettingsRequested(payload.params || null);
        if (payload.event === "launch" || payload.event === "close") parent.windowExit();
    }

    function handToLg(payload) {
        Look.report("error", "settings: Quick Settings launched with no host listening; handed to LG's Quick Settings");
        if (SettingsBus.hook) SettingsBus.hook.restore();
        var c = Qt.createComponent(SettingsBus.lgQuickSettings || lgDefault);
        lg = c.status === Component.Ready ? c.createObject(parent) : null;
        if (!lg) {
            Look.report("error", "settings: LG's Quick Settings could not be loaded: " + c.errorString());
            parent.windowExit();
            return;
        }
        // LG's window has connected itself to the container; it takes this launch and every later event.
        parent.lifeCycleStatusChanged.disconnect(entry.lifeCycle);
        parent.lifeCycleStatusChanged(payload);
    }

    Component.onCompleted: {
        if (!parent || parent.lifeCycleStatusChanged === undefined) {
            Look.report("error", "settings: Quick Settings entry loaded outside LG's system UI container");
            return;
        }
        parent.lifeCycleStatusChanged.connect(entry.lifeCycle);
    }
}
