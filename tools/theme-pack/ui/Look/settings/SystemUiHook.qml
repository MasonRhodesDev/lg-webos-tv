import QtQuick 2.4
import ".."

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
        return v && v.appinfo ? v : original;
    }

    // configd answers after the layer starts; until then the table is empty and the hook waits for it.
    property bool waiting: false
    function apply() {
        if (restored) return;
        var lg = source();
        if (!lg || !lg.appinfo) {
            if (!waiting) Look.report("waiting", "settings: system UI table empty until configd answers; the gear opens LG's Quick Settings until then");
            waiting = true;
            return;
        }
        waiting = false;
        var out = {}, list = [], found = false;
        for (var k in lg) out[k] = lg[k];
        for (var i = 0; i < lg.appinfo.length; i++) {
            var e = lg.appinfo[i], copy = {};
            for (var f in e) copy[f] = e[f];
            if (e.id === quickSettings) {
                if (String(e.main) !== String(entry)) SettingsBus.lgQuickSettings = String(e.main);
                copy.main = String(entry);
                found = true;
            }
            list.push(copy);
        }
        if (!found) { Look.report("error", "settings: no Quick Settings entry in the system UI table"); return; }
        out.appinfo = list;
        manager.config = out;
        SettingsBus.hook = hook;
        if (!applied) Look.report("ok", "settings: the gear opens our quick sheet (system UI table)");
        applied = true;
    }

    // Gives LG back its own table (configd's value, or the one it had): the host is going, or a launch found no host.
    // After a restore the hook stays off: configd's later answers no longer re-apply it.
    property bool restored: false
    function restore() {
        if (restored) return;
        restored = true;
        if (connected) host.systemSettings.systemUIManagerChanged.disconnect(hook.apply);
        connected = false;
        if (!applied) return;
        applied = false;
        manager.config = source();
        if (SettingsBus.hook === hook) SettingsBus.hook = null;
        Look.report("warning", "settings: LG's Quick Settings restored in the system UI table");
    }
    property var original: null

    Component.onCompleted: {
        manager = findManager();
        if (!manager) { Look.report("error", "settings: systemUIManager not found; the gear opens LG's Quick Settings"); return; }
        original = manager.config;
        if (host.systemSettings && host.systemSettings.systemUIManagerChanged !== undefined) {
            host.systemSettings.systemUIManagerChanged.connect(hook.apply);
            connected = true;
        }
        apply();
    }
    property bool connected: false
    Component.onDestruction: restore()
}
