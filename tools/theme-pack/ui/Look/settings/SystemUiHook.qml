import QtQuick 2.4
import Look 1.0

// Hook A (SETTINGS-PLAN.md section 2): everything that opens LG's Quick Settings (the gear button, the picture-mode
// and sleep hotkeys, showQuickSettings, voice) opens our quick sheet instead. LG's system UI manager (objectName
// systemUIManager, a child of the compositor root) loads each system UI from its `config.appinfo` table; we give it
// a copy of LG's table whose Quick Settings entry loads QuickSettingsEntry.qml. Assigning `config` cuts LG's binding
// to configd's value, so the copy is made again whenever configd's value changes.
//
// Unverified on the TV: that the table entry is honoured for a running compositor, that configd pushes no later
// value we miss, and that QuickSettingsEntry.qml shares our engine's SettingsBus (TV-CHECKS.md, Settings core).
QtObject {
    id: hook
    property Item host
    property url entry: Qt.resolvedUrl("QuickSettingsEntry.qml")
    readonly property string quickSettings: "com.webos.app.quicksettings"
    property var manager: null
    property bool applied: false

    function findManager() {
        var kids = host ? host.children : [];
        for (var i = 0; i < kids.length; i++) if (kids[i].objectName === "systemUIManager" && kids[i].config !== undefined) return kids[i];
        return null;
    }

    // LG's own table: configd's value once it has answered, else the manager's built-in default.
    function source() {
        var s = host.systemSettings, v = s && s.systemUIManager;
        return v && v.appinfo ? v : manager.config;
    }

    function apply() {
        var lg = source();
        if (!lg || !lg.appinfo) { Look.report("gap", "settings: system UI table unreadable; the gear opens LG's Quick Settings"); return; }
        var out = {}, list = [], found = false;
        for (var k in lg) out[k] = lg[k];
        for (var i = 0; i < lg.appinfo.length; i++) {
            var e = lg.appinfo[i], copy = {};
            for (var f in e) copy[f] = e[f];
            if (e.id === quickSettings) { copy.main = String(entry); found = true; }
            list.push(copy);
        }
        if (!found) { Look.report("gap", "settings: no Quick Settings entry in the system UI table"); return; }
        out.appinfo = list;
        manager.config = out;
        if (!applied) Look.report("ok", "settings: the gear opens our quick sheet (system UI table)");
        applied = true;
    }

    Component.onCompleted: {
        manager = findManager();
        if (!manager) { Look.report("gap", "settings: systemUIManager not found; the gear opens LG's Quick Settings"); return; }
        apply();
        if (host.systemSettings && host.systemSettings.systemUIManagerChanged !== undefined)
            host.systemSettings.systemUIManagerChanged.connect(hook.apply);
    }
}
