import QtQuick 2.4
import ".."
import "pages.js" as Pages

FocusScope {
    id: view
    property var store
    property var entry: null
    property string crumb
    property string sub
    property real headerInset: 0
    property bool pointer: false
    property alias list: list
    readonly property var rows: {
        if (!entry || !store) return [];
        if (active) var rev = store.revision;
        return Pages.model(entry, store, Look);
    }
    readonly property var focusedRow: list.spec(list.currentIndex)
    signal open(var entry)
    signal done()
    signal allSettings()
    signal confirm(var row)
    signal acted(string ref)
    signal edit(var request)
    signal unlock(var row)
    signal changePin()
    signal back()
    signal pointed()

    property bool active: true
    property var watched: []
    function rewatch() {
        if (store) store.unwatch(watched);
        watched = active && entry && store ? Pages.refs(entry) : [];
        if (store) store.watch(watched);
    }
    onActiveChanged: { rewatch(); if (active) { landed = false; landIndex = -1; land(); } }
    onEntryChanged: {
        rewatch();
        landed = false;
        landIndex = -1;
        land();
    }
    Component.onDestruction: if (store) store.unwatch(watched)

    property bool landed: false
    property int landIndex: -1
    property string focusLabel
    function land() {
        if (!entry || !rows.length) return;
        list.currentIndex = landIndex = entry.index !== undefined ? entry.index : Pages.landing(entry, rows);
        list.reveal(false, list.originY);
        landed = entry.id.indexOf("pick:") !== 0 || rows[list.currentIndex].checked === true;
    }
    onRowsChanged: {
        if (!landed) { if (landIndex < 0 || list.currentIndex === landIndex) land(); else landed = true; return; }
        if (!rows.length || list.currentIndex < 0) return;
        if (list.currentIndex < rows.length && rows[list.currentIndex].label === focusLabel) return;
        for (var i = 0; i < rows.length; i++) if (rows[i].label === focusLabel) { list.currentIndex = i; focusLabel = rows[i].label; return; }
        var at = Pages.landing(entry, rows);
        list.currentIndex = at;
        focusLabel = rows[at] && rows[at].label ? rows[at].label : "";
    }

    function run(r) {
        if (!r) return;
        if (r.kind === "page") open(r.entry);
        else if (r.kind === "settings") allSettings();
        else if (r.kind === "action") { store.act(r.ref); acted(r.ref); }
        else if (r.kind === "choose") { store.set(r.ref, r.choice); done(); }
        else if (r.kind === "style") Look.setLook({ "style": r.choice });
        else if (r.kind === "theme") {
            var on = (Look.chosen.themes || []).slice(), at = on.indexOf(r.choice);
            if (at >= 0) on.splice(at, 1); else on.push(r.choice);
            Look.setLook({ "themes": on });
        } else if (r.kind === "auto") Look.setLook({ "auto": !Look.chosen.auto });
        else if (r.kind === "season") Look.setLook({ "themes": Pages.seasonPicked(Look, r.choice) });
        else if (r.kind === "skip") Look.setLook({ "skip": Pages.skipFlipped(Look, r.choice) });
        else if (r.kind === "item") {
            if (r.variant === "toggle") store.set(r.ref, Pages.flipped(r));
            else if (r.variant === "value") open(Pages.drill(r, Pages.title(entry)));
            else if (r.variant === "stepper") step(r, 1);
        } else if (r.kind === "network" || r.kind === "text") {
            var req = Pages.textRequest(r);
            if (req) edit(req);
        } else if (r.kind === "search") store.btSearch();
        else if (r.kind === "changePin") changePin();
    }
    function step(r, delta) {
        var next = Pages.steppedTo(r, delta);
        if (next !== undefined) store.set(r.ref, next);
    }
    function activate(r) {
        if (Pages.choices(r, store)) confirm(r);
        else run(r);
    }
    function perform(r, op) {
        if (op === "run") run(r);
        else if (r.kind === "network") {
            if (op === "join") store.wifiConnect(r.net);
            else if (op === "forget") store.wifiForget(r.net);
        } else if (r.kind === "device") {
            if (op === "pair") store.btPair(r.dev);
            else if (op === "connect") store.btConnect(r.dev);
            else if (op === "disconnect") store.btDisconnect(r.dev);
            else if (op === "forget") store.btForget(r.dev);
        }
    }
    function finishEdit(req, text) {
        if (req.op === "join") store.wifiConnect(req.row.net, text);
        else if (req.op === "set" && text !== req.text) store.set(req.row.ref, text);
    }

    Header {
        id: head
        x: Look.px("space-xs")
        y: view.headerInset
        width: parent.width - 2 * x
        crumb: view.crumb
        title: view.entry ? Pages.title(view.entry) : ""
        subtitle: view.sub
    }
    RowList {
        id: list
        y: head.y + head.height
        width: parent.width
        height: parent.height - y
        focus: true
        pointer: view.pointer
        rows: view.rows
        model: view.rows.length
        onCurrentIndexChanged: { var r = spec(currentIndex); view.focusLabel = r && r.label ? r.label : ""; }
        onActivated: {
            if (row.locked) view.unlock(row);
            else view.activate(row);
        }
        onAdjusted: {
            var r = spec(index);
            if (!r || r.kind !== "item" || r.disabled) return;
            if (r.variant === "stepper") { view.step(r, delta); return; }
            if (r.variant !== "slider") return;
            var next = Pages.stepped(view.store, r.ref, delta);
            if (next !== undefined) view.store.set(r.ref, next);
        }
        onBack: view.back()
        onPointed: view.pointed()
    }
}
