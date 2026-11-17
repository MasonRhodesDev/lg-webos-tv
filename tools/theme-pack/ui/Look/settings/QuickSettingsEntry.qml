import QtQuick 2.4
import ".."

FocusScope {
    id: entry
    anchors.fill: parent
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
        parent.lifeCycleStatusChanged.disconnect(entry.lifeCycle);
        parent.lifeCycleStatusChanged(payload);
    }

    Component.onCompleted: {
        if (!parent || parent.lifeCycleStatusChanged === undefined) {
            Look.report("error", "settings: Quick Settings entry loaded outside LG's system UI container");
            return;
        }
        box = parent;
        box.lifeCycleStatusChanged.connect(entry.lifeCycle);
    }
    property Item box: null
    Component.onDestruction: { try { if (box) box.lifeCycleStatusChanged.disconnect(entry.lifeCycle); } catch (e) { } }
}
