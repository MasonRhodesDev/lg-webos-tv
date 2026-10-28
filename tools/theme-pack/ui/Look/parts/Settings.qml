import QtQuick 2.4
import WebOSServices 1.0
import Look 1.0
import "../settings"
import "../settings/menu.js" as Menu

// Our own Settings and the gear button's quick sheet (SETTINGS-PLAN.md, the owner's Settings boards). A part of our
// own: it replaces no LG item. It opens on
//   - Look.settingsRequested(target): the Settings stub over LG's Settings app, deep links, luna-send openSettings;
//   - SettingsBus.quickSettingsRequested(params): LG's Quick Settings launches, through Hook A (SystemUiHook.qml);
//   - the quick sheet's "All settings".
// While either is open it holds focus in LG's focus chain (FocusLink.qml) at layer 7, above LG's overlays (5) and
// popups (6). Back pops a page; when LG takes Back itself (the app underneath refuses it, SETTINGS-PLAN.md 3.4) the
// key filter emits backReleased and LG goes Home, so we close.
// Once live it reports `ready` "settings: host ready"; the boot hook mounts the Settings stub only after that.
FocusScope {
    id: part
    property Item host: parent && parent.host !== undefined ? parent.host : null
    readonly property int layerNumber: 7
    readonly property bool shown: quick.open || menu.open
    // LG's key filter knows when the magic remote's pointer is showing.
    readonly property bool pointer: !!(host && host.keyFilter && host.keyFilter.cursorVisible)
    property alias quick: quick
    property alias menu: menu
    property alias store: store
    anchors.fill: parent

    SettingsStore { id: store }
    property var toast: Service { appId: store.appId }
    // LG's focus chain; tests give a stand-in with the same two functions.
    property url focusChain: Qt.resolvedUrl("../settings/LgFocus.qml")
    FocusLink { id: focusLink; chain: part.focusChain }
    readonly property var focusHandler: focusLink.handler
    property var hook: null

    property bool holding: false
    onShownChanged: {
        if (shown && !holding) { holding = true; focusLink.request(part); }
        else if (!shown && holding) { holding = false; focusLink.release(part); }
    }

    // A gear press while the sheet is still arriving is the remote repeating a held key, not a second press.
    property real openedAt: 0
    function quickSettings(params) {
        var now = new Date().getTime();
        var hot = params && params.activateType ? Menu.activateTypes[params.activateType] : "";
        // A hotkey for a page rather than a quick sheet row (aspect ratio) opens Settings there.
        if (hot && !store.item(hot)) { settings(hot); return; }
        if (hot) { menu.close(); quick.openWith(params); openedAt = now; return; }
        if (shown) {
            if (now - openedAt < Look.px("motion-enter")) return;
            quick.close();
            menu.close();
            return;
        }
        quick.openWith(params);
        openedAt = now;
    }
    // The Settings stub may ask twice for one launch; the same target while open is no change.
    property string target: ""
    function settings(t) {
        t = t || "";
        if (menu.open && t === target) return;
        target = t;
        quick.close();
        menu.openAt(t);
        openedAt = new Date().getTime();
    }
    function closeAll() { quick.close(); menu.close(); }

    QuickSheet {
        id: quick
        store: store
        pointer: part.pointer
        focus: open
        onAllSettings: part.settings("")
    }
    SettingsMenu {
        id: menu
        store: store
        pointer: part.pointer
        focus: open
        onClosed: Look.closeSettings()
    }

    function launchSystemUi(appId) {
        closeAll();
        var m = hook ? hook.manager : null;
        if (m) m.launch(appId, { "appId": appId, "params": {} });
        else Look.report("gap", "settings: cannot open " + appId + " (no system UI manager)");
    }
    // A write was rolled back; say so with LG's toast, which our toast part draws.
    function writeFailed(ref, text) {
        toast.call("luna://com.webos.notification", "/createToast",
                   JSON.stringify({ "sourceId": "dev.themepack.look", "message": "Not changed: " + text }));
        Look.report("warning", "settings: " + ref + " not saved: " + text);
    }

    Component.onCompleted: {
        Look.settingsRequested.connect(part.settings);
        SettingsBus.quickSettingsRequested.connect(part.quickSettings);
        store.systemUiRequested.connect(part.launchSystemUi);
        store.failed.connect(part.writeFailed);
        if (host && host.keyFilter && host.keyFilter.backReleased) host.keyFilter.backReleased.connect(part.closeAll);
        SettingsBus.ready = true;
        if (host) {
            var c = Qt.createComponent(Qt.resolvedUrl("../settings/SystemUiHook.qml"));
            if (c.status === Component.Ready) hook = c.createObject(part, { "host": host });
            else Look.report("error", "settings: " + c.errorString());
        }
        // Ready means the host and Hook A are both live; the boot hook mounts the Settings stub only then.
        if (hook && hook.applied) Look.report("ready", "settings: host ready");
        else Look.report("gap", "settings: host up, but Hook A is not applied; not reporting ready");
    }
    Component.onDestruction: {
        SettingsBus.ready = false;
        if (hook) hook.restore();
        Look.settingsRequested.disconnect(part.settings);
        SettingsBus.quickSettingsRequested.disconnect(part.quickSettings);
    }
}
