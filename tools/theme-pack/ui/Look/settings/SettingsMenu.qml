import QtQuick 2.4
import Look 1.0
import "pages.js" as Pages

// Our Settings (the owner's Settings board): one full panel with the categories down the left and the open page on
// the right. Focus is in one of the two. In the categories, Up/Down show each category's page and OK or Right goes
// into it; in a page, OK opens links and pickers, Left or Back goes back a page and, from a category's first page,
// back to the categories; Back there closes.
//
// The navigation stack holds page entries (pages.js): [category page, sub-page, ..., picker].
FocusScope {
    id: menu
    property var store
    property bool open: false
    // The magic remote's pointer is showing: rows follow it and take clicks.
    property bool pointer: false
    property var stack: []
    property string area: "categories"
    readonly property var topEntry: stack.length ? stack[stack.length - 1] : null
    readonly property string category: topEntry ? Pages.categoryFor(stack[0].id) : "picture"
    signal closed()
    // The open category's page. Each category's page is made the first time it shows and kept while Settings lives,
    // so moving between categories shows a page instead of making its rows again (a row costs the TV tens of ms).
    property Item page: null
    property alias categories: cats
    property alias dialog: dialog
    property alias footer: foot
    anchors.fill: parent

    // Opens at a target (pages.js target(): a category, a page id or an LG deep-link name); "" is the first page with
    // focus in the categories. Opening again while open goes to the new target.
    function openAt(target) {
        var ids = Pages.target(target), s = [];
        for (var i = 0; i < ids.length; i++) s.push({ "id": ids[i] });
        if (!s.length) s = [{ "id": Pages.topOf("picture") }];
        stack = s;
        showPage();
        area = ids.length ? "page" : "categories";
        cats.currentIndex = indexOfCategory(category);
        open = true;
        prefetching.restart();
        focusArea();
        guard();
    }
    function close() {
        if (!open) return;
        open = false;
        confirming = null;
        editing = null;
        pinning = null;
        // The PIN is asked again on the next visit, and read afresh then.
        store.unlocked = false;
        store.forgetPin();
        store.changed();
        closed();
    }
    function push(entry) {
        var s = stack.slice();
        s[s.length - 1].index = page.list.currentIndex;
        if ((entry.id.indexOf("pick:") === 0 || entry.id.indexOf("adjust:") === 0) && !entry.subSpec) entry.sub = page.sub;
        s.push(entry);
        stack = s;
    }
    function pop() {
        if (stack.length > 1) { stack = stack.slice(0, stack.length - 1); return; }
        area = "categories";
        focusArea();
    }
    // Whether the stack is in this category: read from the stack itself, so a page's bindings never see the stack
    // of one category with the category of another.
    function owns(cat) { return stack.length > 0 && Pages.categoryFor(stack[0].id) === cat; }
    // The other categories' pages are made a little at a time once Settings is up, so a first visit to them is as
    // quick as a return.
    Timer {
        id: prefetching
        interval: Look.px("motion-enter") * 2
        onTriggered: { for (var i = 0; i < pages.count; i++) { var p = pages.itemAt(i); if (p && !p.active) p.active = true; } }
    }
    onStackChanged: { for (var i = 0; i < pages.count; i++) { var p = pages.itemAt(i); if (p && p.item) p.item.follow(); } }
    onCategoryChanged: showPage()
    // The open category's page is made now if it is not made yet, or finished now if it is still being made.
    function showPage() {
        var slot = pages.itemAt(indexOfCategory(category));
        if (!slot) return;
        slot.asynchronous = false;
        slot.active = true;
        if (slot.item) page = slot.item;
    }
    function indexOfCategory(id) {
        var c = Pages.categories(id);
        for (var i = 0; i < c.length; i++) if (c[i].category === id) return i;
        return 0;
    }
    // A prompt that is up keeps the keys, whatever moved underneath it.
    function focusArea() {
        if (pinning !== null) pin.forceActiveFocus();
        else if (editing !== null) entry.forceActiveFocus();
        else if (area === "page") page.forceActiveFocus();
        else cats.forceActiveFocus();
    }

    property var confirming: null
    readonly property var choice: Pages.choices(confirming, store)
    // The keyboard's request (Pages.textRequest), and the PIN prompt's step: { mode: check|new|again, row, first }.
    property var editing: null
    property var pinning: null
    property alias entry: entry
    property alias pin: pin

    // Everything the prompt opens with is set before it shows: it resets its keys from them as it opens.
    function startEdit(req) {
        entry.text = req.text;
        entry.layout = req.layout;
        editing = req;
    }
    // A page behind the PIN (Pages.lockedPage), however it was reached (a link, a target, the back stack), asks for
    // the PIN before it shows anything; Back from that prompt leaves it.
    onTopEntryChanged: guard()
    function guard() {
        if (open && topEntry && Pages.lockedPage(topEntry.id, store) && pinning === null) pinning = { "mode": "page", "entry": topEntry };
    }
    function leaveLocked() {
        var s = stack.slice();
        while (s.length > 1 && Pages.lockedPage(s[s.length - 1].id, store)) s.pop();
        if (Pages.lockedPage(s[s.length - 1].id, store)) s = [{ "id": Pages.topOf(Pages.categoryFor(s[0].id)) }];
        stack = s;
    }
    function pinEntered(code) {
        var p = pinning;
        if (p.mode === "check") {
            if (!store.pinKnown()) { pin.reject("The TV has not given us its PIN yet. Try again."); return; }
            if (!store.pinMatches(code)) { pin.reject("Wrong PIN. Try again."); return; }
            store.unlocked = true;
            store.changed();
            pinning = null;
            page.activate(p.row);
        } else if (p.mode === "new") {
            pinning = { "mode": "again", "first": code };
            pin.reset();
        } else if (p.mode === "page") {
            if (!store.pinKnown()) { pin.reject("The TV has not given us its PIN yet. Try again."); return; }
            if (!store.pinMatches(code)) { pin.reject("Wrong PIN. Try again."); return; }
            store.unlocked = true;
            store.changed();
            pinning = null;
        } else if (code === p.first) {
            pinning = null;
            store.set("Safety/systemPin", code);
        } else {
            pinning = { "mode": "new" };
            pin.reset();
            pin.error = "The two did not match. Choose a new PIN.";
        }
    }

    Keys.onPressed: {
        if (!open) return;
        if (event.key === Qt.Key_Left && area === "page") { pop(); event.accepted = true; }
        else if (event.key === Qt.Key_Right && area === "categories") { area = "page"; focusArea(); event.accepted = true; }
    }

    // What the footer says: online or not, and LG's data agreements (pages.js footer()).
    property var footerWatch: Pages.footerRefs
    onOpenChanged: { if (open) store.watch(footerWatch); else store.unwatch(footerWatch); }

    Panel {
        id: panel
        placement: "full"
        // The keyboard and the PIN prompt take the screen, as their boards draw them: over the picture alone.
        shown: menu.open && menu.editing === null && menu.pinning === null
        padding: Look.px("space-xl")

        Item {
            id: side
            width: Look.px("panel-w") * 0.75
            height: parent.height
            Label {
                id: name
                x: Look.px("space-xs")
                role: "display"
                text: "Settings"
            }
            RowList {
                id: cats
                y: name.height + Look.px("space-l")
                width: parent.width
                height: foot.y - y - Look.px("space-s")
                pointer: menu.pointer
                focusShown: menu.area === "categories"
                rows: Pages.categories(menu.category)
                model: rows.length
                function show(c) {
                    if (!c || c.category === menu.category) return;
                    // The category's first page as its kept page holds it, so the page shows without changing.
                    var top = Pages.topOf(c.category), kept = pages.itemAt(menu.indexOfCategory(c.category));
                    kept = kept && kept.item ? kept.item.entry : null;
                    menu.stack = [kept && kept.id === top ? kept : { "id": top }];
                }
                // Keys walk the categories and show each page; the pointer only points at one, and a click opens it.
                onCurrentIndexChanged: if (menu.open && menu.area === "categories" && !pointing) show(spec(currentIndex))
                onPointed: if (menu.area !== "categories") { menu.area = "categories"; menu.focusArea(); }
                onActivated: { show(row); menu.area = "page"; menu.focusArea(); }
                onBack: menu.close()
            }
            Label {
                id: foot
                x: Look.px("space-xs")
                y: parent.height - height
                role: "caption"
                color: Look.color("ink-3")
                text: { var rev = menu.store.revision; return Pages.footer(menu.store); }
            }
        }
        Divider {
            id: rule
            vertical: true
            x: side.width + Look.px("space-xl")
        }
        Repeater {
            id: pages
            model: Pages.categories("")
            Loader {
                id: slot
                readonly property string cat: modelData.category
                x: rule.x + rule.width + Look.px("space-xl")
                width: parent.width - x
                height: parent.height
                active: false
                asynchronous: true
                visible: menu.category === cat
                sourceComponent: PageView {
                    // Follows the stack while it is in this category; out of it, keeps its last page as it was.
                    // Made ahead of a visit, it holds its category's first page.
                    function follow() {
                        var s = menu.stack;
                        if (menu.owns(slot.cat)) entry = s[s.length - 1];
                        else if (!entry) entry = { "id": Pages.topOf(slot.cat) };
                    }
                    Component.onCompleted: follow()
                    headerInset: Look.px("space-s")
                    store: menu.store
                    pointer: menu.pointer
                    active: menu.open && menu.owns(slot.cat)
                    crumb: { var s = menu.stack; return menu.owns(slot.cat) && s.length > 1 ? Pages.title(s[s.length - 2]) : ""; }
                    sub: {
                        var rev = active ? menu.store.revision : 0, e = entry;
                        if (!e) return "";
                        return e.subSpec ? Pages.subtitle(e.subSpec, menu.store) : e.sub || Pages.subtitle(Pages.expanded(e).sub, menu.store);
                    }
                    list.focusShown: menu.area === "page"
                    onPointed: if (menu.area !== "page" && menu.editing === null && menu.pinning === null) { menu.area = "page"; menu.focusArea(); }
                    onOpen: menu.push(entry)
                    onDone: menu.pop()
                    onBack: menu.pop()
                    onAllSettings: {}
                    onConfirm: menu.confirming = row
                    onEdit: menu.startEdit(request)
                    onUnlock: menu.pinning = { "mode": "check", "row": row }
                    onChangePin: { menu.pinning = { "mode": "new" }; pin.reset(); }
                }
                // Made after it was asked for: it takes over as the page, focus included.
                onLoaded: if (menu.category === cat && menu.page !== item) { menu.page = item; if (menu.open) menu.focusArea(); }
            }
        }
    }

    Dialog {
        id: dialog
        shown: menu.choice !== null
        title: menu.choice ? menu.choice.title : ""
        body: menu.choice ? menu.choice.body : ""
        icon: menu.choice ? menu.choice.icon : ""
        hue: menu.confirming ? menu.confirming.hue : -1
        buttons: menu.choice ? menu.choice.buttons : ["Cancel"]
        onShownChanged: if (shown) { currentIndex = 0; forceActiveFocus(); } else menu.focusArea()
        onActivated: {
            var r = menu.confirming, c = menu.choice;
            menu.confirming = null;
            if (c && c.ops[index]) page.perform(r, c.ops[index]);
        }
        onBack: menu.confirming = null
    }
    TextPrompt {
        id: entry
        shown: menu.editing !== null
        pointer: menu.pointer
        label: menu.editing ? menu.editing.label : ""
        minLength: menu.editing ? menu.editing.min : 0
        maxLength: menu.editing ? menu.editing.max : 0
        secret: menu.editing ? menu.editing.secret : false
        doneLabel: menu.editing ? menu.editing.done : "Done"
        onShownChanged: if (shown) forceActiveFocus(); else menu.focusArea()
        onAccepted: { var e = menu.editing; menu.editing = null; page.finishEdit(e, text); }
        onCancelled: menu.editing = null
    }
    PinPrompt {
        id: pin
        shown: menu.pinning !== null
        pointer: menu.pointer
        title: !menu.pinning || menu.pinning.mode === "check" || menu.pinning.mode === "page" ? "Enter PIN" : menu.pinning.mode === "new" ? "Choose a new PIN" : "Enter it again"
        body: !menu.pinning || menu.pinning.mode === "check" || menu.pinning.mode === "page" ? "Settings are locked" : menu.pinning.mode === "new" ? "Four digits" : "To be sure"
        onShownChanged: if (shown) forceActiveFocus(); else menu.focusArea()
        onEntered: menu.pinEntered(pin)
        onCancelled: {
            // Back out of a locked page's PIN: off the page, however it was reached.
            if (menu.pinning && menu.pinning.mode === "page") menu.leaveLocked();
            menu.pinning = null;
        }
    }
}
