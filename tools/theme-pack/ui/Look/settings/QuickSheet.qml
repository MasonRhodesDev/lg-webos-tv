import QtQuick 2.4
import Look 1.0
import "pages.js" as Pages
import "menu.js" as Menu

// The gear button's quick sheet (the owner's Quick settings board): a side panel of the everyday settings, changed in
// place. OK on a value opens its picker in the same panel; OK there chooses and comes back. Left/Right move the
// volume; OK flips Energy saving, turns the screen off, or opens all Settings. Back goes back a step, then closes.
FocusScope {
    id: sheet
    property var store
    property bool open: false
    // The magic remote's pointer is showing: rows follow it and take clicks.
    property bool pointer: false
    property var stack: [{ "id": "quick" }]
    readonly property var topEntry: stack[stack.length - 1]
    signal allSettings()
    signal closed()
    property alias view: view
    anchors.fill: parent

    // Opens at the top, or for a hotkey (LG's activateType) with that row's picker open.
    function openWith(params) {
        var s = [{ "id": "quick" }], ref = params && params.activateType ? Menu.activateTypes[params.activateType] : "";
        if (ref && Menu.extra[ref] === undefined && store.item(ref)) {
            s[0].focusRef = ref;
            var spec = null;
            for (var i = 0; i < Menu.quick.rows.length; i++) if (Menu.quick.rows[i].item === ref) spec = Menu.quick.rows[i];
            if (spec) s.push({ "id": "pick:" + ref, "ref": ref, "title": spec.label, "icon": spec.icon, "crumb": Menu.quick.title });
        }
        stack = s;
        open = true;
        view.forceActiveFocus();
    }
    function close() {
        if (!open) return;
        open = false;
        closed();
    }
    function push(entry) {
        var s = stack.slice();
        s[s.length - 1].index = view.list.currentIndex;
        s.push(entry);
        stack = s;
    }
    function pop() {
        if (stack.length > 1) stack = stack.slice(0, stack.length - 1);
        else close();
    }
    property var confirming: null

    Panel {
        placement: "side-left"
        shown: sheet.open
        PageView {
            id: view
            width: parent.width
            height: hints.y - Look.px("space-m")
            headerInset: Look.px("space-s")
            store: sheet.store
            pointer: sheet.pointer
            active: sheet.open
            entry: sheet.topEntry
            crumb: sheet.stack.length > 1 ? Pages.title(sheet.stack[sheet.stack.length - 2]) : ""
            sub: { var rev = sheet.store.revision; return Pages.subtitle(Menu.quick.sub, sheet.store); }
            onOpen: sheet.push(entry)
            onDone: sheet.pop()
            onBack: sheet.pop()
            onAllSettings: sheet.allSettings()
            onConfirm: sheet.confirming = row
            onActed: if (ref === "screenOff" || ref === "inputPicker") sheet.close()
        }
        KeyHints {
            id: hints
            x: Look.px("space-xs")
            y: parent.height - height
            hints: [{ keys: ["up", "down"], label: "Move" }, { key: "OK", label: "Change" }, { key: "BACK", label: sheet.stack.length > 1 ? "Back" : "Close" }]
        }
    }

    Dialog {
        shown: sheet.confirming !== null
        title: sheet.confirming ? sheet.confirming.label : ""
        body: sheet.confirming ? Pages.confirmation(sheet.confirming, sheet.store) : ""
        buttons: ["Cancel", "OK"]
        onShownChanged: if (shown) { currentIndex = 0; forceActiveFocus(); } else view.forceActiveFocus()
        onActivated: { var r = sheet.confirming; sheet.confirming = null; if (index === 1) view.run(r); }
        onBack: sheet.confirming = null
    }
}
