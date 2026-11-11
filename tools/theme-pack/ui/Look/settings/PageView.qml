import QtQuick 2.4
import ".."
import "pages.js" as Pages

// One settings page as the kit draws it: a Header above a RowList of the page's rows, live from
// the store. The page framework (pages.js) turns the entry into rows; this does what OK and Left/Right mean on them
// and says when the page wants another: open(entry) for a link or a picker, done() after a picker's choice,
// allSettings(), confirm(row) for a row that asks first (Pages.choices), edit(request) for text (the keyboard),
// unlock(row) for a row behind the PIN, changePin(). Watches the store for its items while it shows them.
FocusScope {
    id: view
    property var store
    property var entry: null
    property string crumb
    property string sub
    property real headerInset: 0
    property bool pointer: false
    property alias list: list
    // Live while shown; a hidden page makes its rows once and leaves them, rather than following every change.
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
    // The pointer came onto one of the rows.
    signal pointed()

    // Subscribed only while shown: a closed sheet or Settings holds nothing open on the bus.
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

    // Lands once per entry, when its rows are there; then focus stays on the same row through live updates.
    property bool landed: false
    property int landIndex: -1
    property string focusLabel
    function land() {
        if (!entry || !rows.length) return;
        list.currentIndex = landIndex = entry.index !== undefined ? entry.index : Pages.landing(entry, rows);
        // Landing opens the page: placed from its top, wherever the last page left the list.
        list.reveal(false, list.originY);
        // A picker lands again once the current value is known (the store's first answer may come later).
        landed = entry.id.indexOf("pick:") !== 0 || rows[list.currentIndex].checked === true;
    }
    onRowsChanged: {
        // Not landed yet: land, unless the user has already moved.
        if (!landed) { if (landIndex < 0 || list.currentIndex === landIndex) land(); else landed = true; return; }
        // A page behind the PIN has no rows until it is entered; a list with nothing focused yet keeps it so.
        if (!rows.length || list.currentIndex < 0) return;
        if (list.currentIndex < rows.length && rows[list.currentIndex].label === focusLabel) return;
        // The list may still hold the old rows while this runs, so the label is set here, not read back from it.
        for (var i = 0; i < rows.length; i++) if (rows[i].label === focusLabel) { list.currentIndex = i; focusLabel = rows[i].label; return; }
        var at = Pages.landing(entry, rows);
        list.currentIndex = at;
        focusLabel = rows[at] && rows[at].label ? rows[at].label : "";
    }

    // OK on a row.
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
        } else if (r.kind === "network" || r.kind === "text") {
            var req = Pages.textRequest(r);
            if (req) edit(req);
        } else if (r.kind === "search") store.btSearch();
        else if (r.kind === "changePin") changePin();
    }
    // OK on a row once it is unlocked: ask first if it asks, else do it.
    function activate(r) {
        if (Pages.choices(r, store)) confirm(r);
        else run(r);
    }
    // A Dialog button's op (Pages.choices) on a row.
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
    // The keyboard's Done on a text request (Pages.textRequest).
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
            if (!r || r.kind !== "item" || r.variant !== "slider") return;
            var next = Pages.stepped(view.store, r.ref, delta);
            if (next !== undefined) view.store.set(r.ref, next);
        }
        onBack: view.back()
        onPointed: view.pointed()
    }
}
