import QtQuick 2.4
import Look 1.0
import "pages.js" as Pages

// One settings page as the kit draws it (DESIGN.md, a page): a Header above a RowList of the page's rows, live from
// the store. The page framework (pages.js) turns the entry into rows; this does what OK and Left/Right mean on them
// and says when the page wants another: open(entry) for a link or a picker, done() after a picker's choice,
// allSettings(), confirm(row) for an action that asks first. Watches the store for its items while it shows them.
FocusScope {
    id: view
    property var store
    property var entry: null
    property string crumb
    property string sub
    property real headerInset: 0
    property bool pointer: false
    property alias list: list
    readonly property var rows: { var rev = store ? store.revision : 0; return entry && store ? Pages.model(entry, store, Look) : []; }
    readonly property var focusedRow: list.spec(list.currentIndex)
    signal open(var entry)
    signal done()
    signal allSettings()
    signal confirm(var row)
    signal acted(string ref)
    signal back()

    property var watched: []
    onEntryChanged: {
        if (store) store.unwatch(watched);
        watched = entry && store ? Pages.refs(entry) : [];
        if (store) store.watch(watched);
        landed = false;
        land();
    }
    Component.onDestruction: if (store) store.unwatch(watched)

    // Lands once per entry, when its rows are there; then focus stays on the same row through live updates.
    property bool landed: false
    property string focusLabel
    function land() {
        if (!entry || !rows.length) return;
        list.currentIndex = entry.index !== undefined ? entry.index : Pages.landing(entry, rows);
        list.reveal(false);
        landed = true;
    }
    onRowsChanged: {
        if (!landed) { land(); return; }
        if (list.currentIndex < rows.length && rows[list.currentIndex].label === focusLabel) return;
        for (var i = 0; i < rows.length; i++) if (rows[i].label === focusLabel) { list.currentIndex = i; return; }
        list.currentIndex = Pages.landing(entry, rows);
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
        } else if (r.kind === "item") {
            if (r.variant === "toggle") store.set(r.ref, Pages.flipped(r));
            else if (r.variant === "value") open(Pages.drill(r, Pages.title(entry)));
        }
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
        onCurrentIndexChanged: { var r = spec(currentIndex); view.focusLabel = r ? r.label : ""; }
        onActivated: {
            if (Pages.confirmation(row, view.store)) view.confirm(row);
            else view.run(row);
        }
        onAdjusted: {
            var r = spec(index);
            if (r && r.kind === "item" && r.variant === "slider") view.store.set(r.ref, Pages.stepped(view.store, r.ref, delta));
        }
        onBack: view.back()
    }
}
