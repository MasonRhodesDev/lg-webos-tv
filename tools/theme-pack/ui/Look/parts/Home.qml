import QtQuick 2.4
import ".."
import "../settings"

// Our Home dock. A part of our own: it replaces no LG item. The Home key reaches it through a key filter of ours
// (ui/home-key.js, installed by HomeKeyHook.qml) that launches our system UI entry (HomeEntry.qml), which emits
// SettingsBus.homeRequested.
// The key filter is installed only while Hook A's table carries our entry (SettingsBus.hook set): without the entry
// a launch would find nothing, and Home would do nothing.
FocusScope {
    id: part
    property Item host: parent && parent.host !== undefined ? parent.host : null
    anchors.fill: parent

    property bool open: false
    property int requests: 0
    readonly property var probe: ({ "open": open, "requests": requests, "keys": keys.installed })

    HomeKeyHook { id: keys; host: part.host }

    function requested(params) {
        requests++;
        Look.report("ok", "home: requested (" + requests + ")");
    }
    // Install while the table carries our entry, give LG's chain back when it does not.
    function follow() {
        if (retired) return;
        var live = SettingsBus.hook !== null && SettingsBus.hook.applied;
        if (live && !keys.installed) keys.install();
        else if (!live && (keys.installed || keys.wanted)) keys.restore();
    }

    Component.onCompleted: {
        SettingsBus.homeRequested.connect(part.requested);
        SettingsBus.hookChanged.connect(part.follow);
        SettingsBus.homeReady = true;
        follow();
    }

    property bool retired: false
    function retire() {
        if (retired) return;
        retired = true;
        SettingsBus.homeReady = false;
        SettingsBus.homeRequested.disconnect(part.requested);
        SettingsBus.hookChanged.disconnect(part.follow);
        keys.restore();
    }
    Component.onDestruction: retire()
}
