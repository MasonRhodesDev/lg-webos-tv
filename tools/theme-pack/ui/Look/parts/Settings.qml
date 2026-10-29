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
    // Our menus always take the pointer while open. LG's cursorVisible flag drops back to false within a second or two
    // even while the magic remote is in use, so gating on it let clicks fall through to the app underneath.
    readonly property bool pointer: true
    property alias quick: quick
    property alias menu: menu
    property alias store: store
    anchors.fill: parent

    // Where the sheet and Settings stand, for the TV suite (Layer.qml publishes it): which pages are open, where focus
    // is and what kind of row holds it, and any dialog, keyboard or PIN prompt up.
    function probeRow(r, i) {
        if (!r) return null;
        return { "index": i, "label": r.label || "", "kind": r.kind || "", "variant": r.variant || "", "ref": r.ref || "",
                 "choice": r.choice === undefined ? "" : String(r.choice), "category": r.category || "", "locked": !!r.locked };
    }
    // The keyboard: the text (never a secret one), the focused key and the grid, so the suite can walk to a key.
    function probeKeyboard() {
        var kb = menu.entry.keyboard, grid = [];
        for (var r = 0; r < kb.rows.length; r++) {
            var row = [];
            for (var c = 0; c < kb.rows[r].length; c++) row.push(kb.rows[r][c].label);
            grid.push(row);
        }
        return { "label": menu.editing.label || "", "length": menu.entry.text.length, "text": menu.editing.secret ? "" : menu.entry.text,
                 "row": kb.row, "col": kb.col, "keys": grid };
    }
    function probeIds(stack) { var out = []; for (var i = 0; i < stack.length; i++) out.push(stack[i].id); return out; }
    readonly property var probe: ({
        "quick": { "open": quick.open, "stack": probeIds(quick.stack), "dialog": quick.confirming !== null,
                   "focus": probeRow(quick.view.focusedRow, quick.view.list.currentIndex) },
        "menu": { "open": menu.open, "stack": probeIds(menu.stack), "area": menu.area, "category": menu.category,
                  "dialog": menu.confirming !== null,
                  "focus": menu.area === "categories" ? probeRow(menu.categories.spec(menu.categories.currentIndex), menu.categories.currentIndex)
                                                      : probeRow(menu.page.focusedRow, menu.page.list.currentIndex),
                  "editing": menu.editing ? probeKeyboard() : null,
                  "pin": menu.pinning ? { "mode": menu.pinning.mode, "length": menu.pin.pin.length, "error": menu.pin.error,
                                          "pad": menu.pin.pad.currentIndex } : null }
    })

    SettingsStore { id: store }
    property var toast: Service { appId: store.appId }
    // LG's focus chain; tests give a stand-in with the same two functions.
    property url focusChain: Qt.resolvedUrl("../settings/LgFocus.qml")
    FocusLink { id: focusLink; chain: part.focusChain }
    readonly property var focusHandler: focusLink.handler
    property var hook: null

    property bool holding: false
    onShownChanged: {
        if (shown && !holding) { holding = true; borrowPopupPlane(); focusLink.request(part); }
        else if (!shown && holding) { holding = false; focusLink.release(part); returnPopupPlane(); }
    }

    // LG's key filter hands Back to the focused item only in a few cases; one is "LG's popup plane has focus and no
    // popup in it claims Back" (KeyFilters/systemUi.js). Otherwise it emits backReleased and LG goes Home. So while a
    // menu of ours is open it lives inside the popup plane, which is shown for the time (it hides itself when empty).
    property Item plane: null
    property Item home: null
    property real planeZ: 0
    function findPopupPlane() {
        var kids = host ? host.children : [];
        for (var i = 0; i < kids.length; i++)
            if (kids[i].backKeyFilter !== undefined && kids[i].currentView !== undefined && kids[i].layerNumber === 6) return kids[i];
        return null;
    }
    function borrowPopupPlane() {
        var p = findPopupPlane();
        if (!p) { Look.report("gap", "settings: LG's popup plane not found; Back goes to LG"); return; }
        plane = p;
        home = part.parent;
        planeZ = p.z;
        // Raised to our layer's height too: in its own place LG's views above it would take the pointer.
        p.z = home ? home.z : p.z;
        p.visible = true;
        part.parent = p;
    }
    function returnPopupPlane() {
        if (!plane) return;
        var p = plane;
        plane = null;
        part.parent = home;
        p.z = planeZ;
        p.visible = Qt.binding(function () { return p.model.count > 0; });
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
    property bool readyReported: false
    function reportReady() {
        if (readyReported || !hook || !hook.applied) return;
        readyReported = true;
        Look.report("ready", "settings: host ready");
    }
    function closeAll() { quick.close(); menu.close(); }

    // Behind our menus while one is open: a click outside them closes ours instead of reaching the app underneath
    // (the HDMI app's banner took such clicks), and the pointer never falls through.
    MouseArea {
        anchors.fill: parent
        enabled: part.shown
        hoverEnabled: enabled
        acceptedButtons: Qt.AllButtons
        onClicked: part.closeAll()
        onWheel: wheel.accepted = true
    }

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
    // A network or pairing action: what happened, in a whole sentence, with LG's toast.
    function say(text) {
        toast.call("luna://com.webos.notification", "/createToast", JSON.stringify({ "sourceId": "dev.themepack.look", "message": text }));
    }
    function actionDone(ref, text) { say(text); }
    function actionRefused(ref, text) {
        say(text);
        Look.report("warning", "settings: " + ref + ": " + text);
    }

    Component.onCompleted: {
        Look.settingsRequested.connect(part.settings);
        SettingsBus.quickSettingsRequested.connect(part.quickSettings);
        store.systemUiRequested.connect(part.launchSystemUi);
        store.failed.connect(part.writeFailed);
        store.refused.connect(part.actionRefused);
        store.succeeded.connect(part.actionDone);
        if (host && host.keyFilter && host.keyFilter.backReleased) host.keyFilter.backReleased.connect(part.closeAll);
        SettingsBus.ready = true;
        if (host) {
            var c = Qt.createComponent(Qt.resolvedUrl("../settings/SystemUiHook.qml"));
            if (c.status === Component.Ready) hook = c.createObject(part, { "host": host });
            else Look.report("error", "settings: " + c.errorString());
        }
        // Ready means the host and Hook A are both live; the boot hook mounts the Settings stub only then.
        // While configd has not answered, Hook A waits; ready follows as soon as it applies.
        if (hook) hook.appliedChanged.connect(part.reportReady);
        if (hook && hook.applied) reportReady();
        else if (!hook || !hook.waiting) Look.report("gap", "settings: host up, but Hook A is not applied; not reporting ready");
    }
    Component.onDestruction: {
        SettingsBus.ready = false;
        if (hook) hook.restore();
        Look.settingsRequested.disconnect(part.settings);
        SettingsBus.quickSettingsRequested.disconnect(part.quickSettings);
    }
}
