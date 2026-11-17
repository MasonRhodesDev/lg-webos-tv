import QtQuick 2.4
import WebOSServices 1.0
import ".."
import "../settings"
import "../settings/menu.js" as Menu

FocusScope {
    id: part
    property Item host: null
    function findHost() { if (!host && parent && parent.host !== undefined) host = parent.host; }
    readonly property int layerNumber: 7
    readonly property bool shown: quick.open || menu.open
    readonly property bool pointer: true
    property alias quick: quick
    property alias menu: menu
    property alias store: store
    anchors.fill: parent

    function probeRow(r, i) {
        if (!r) return null;
        return { "index": i, "label": r.label || "", "kind": r.kind || "", "variant": r.variant || "", "ref": r.ref || "",
                 "choice": r.choice === undefined ? "" : String(r.choice), "category": r.category || "", "locked": !!r.locked };
    }
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
                                                      : menu.page ? probeRow(menu.page.focusedRow, menu.page.list.currentIndex) : null,
                  "editing": menu.editing ? probeKeyboard() : null,
                  "pin": menu.pinning ? { "mode": menu.pinning.mode, "length": menu.pin.pin.length, "error": menu.pin.error,
                                          "pad": menu.pin.pad.currentIndex } : null }
    })

    SettingsStore { id: store }
    property var toast: Service { appId: store.appId }
    property url focusChain: Qt.resolvedUrl("../settings/LgFocus.qml")
    FocusLink { id: focusLink; chain: part.focusChain }
    readonly property var focusHandler: focusLink.handler
    property var hook: null

    property bool holding: false
    onShownChanged: {
        if (shown && !holding) { holding = true; plane.take(); focusLink.request(part); }
        else if (!shown && holding) { holding = false; focusLink.release(part); plane.give(); }
    }

    Hold { id: plane; host: part.host; item: part; onYielded: part.closeAll() }

    property real openedAt: 0
    function quickSettings(params) {
        var now = new Date().getTime();
        var hot = params && params.activateType ? Menu.activateTypes[params.activateType] : "";
        if (hot && !store.item(hot)) { settings(hot); return; }
        if (hot) { menu.close(); quick.openWith(params); openedAt = now; return; }
        if (shown) {
            if (now >= openedAt && now - openedAt < Look.px("motion-enter")) return;
            quick.close();
            menu.close();
            return;
        }
        quick.openWith(params);
        openedAt = now;
    }
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
    function writeFailed(ref, text) {
        toast.call("luna://com.webos.notification", "/createToast",
                   JSON.stringify({ "sourceId": "dev.themepack.look", "message": "Not changed: " + text }));
        Look.report("warning", "settings: " + ref + " not saved: " + text);
    }
    function say(text) {
        toast.call("luna://com.webos.notification", "/createToast", JSON.stringify({ "sourceId": "dev.themepack.look", "message": text }));
    }
    function actionDone(ref, text) { say(text); }
    function actionRefused(ref, text) {
        say(text);
        Look.report("warning", "settings: " + ref + ": " + text);
    }

    Component.onCompleted: {
        findHost();
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
        if (hook) hook.appliedChanged.connect(part.reportReady);
        if (hook && hook.applied) reportReady();
        else if (!hook || !hook.waiting) Look.report("gap", "settings: host up, but Hook A is not applied; not reporting ready");
    }
    property bool retired: false
    function retire() {
        if (retired) return;
        retired = true;
        closeAll();
        plane.retire();
        SettingsBus.ready = false;
        if (hook) hook.restore();
        Look.settingsRequested.disconnect(part.settings);
        SettingsBus.quickSettingsRequested.disconnect(part.quickSettings);
        try { if (host && host.keyFilter && host.keyFilter.backReleased) host.keyFilter.backReleased.disconnect(part.closeAll); } catch (e) { }
    }
    Component.onDestruction: retire()
}
