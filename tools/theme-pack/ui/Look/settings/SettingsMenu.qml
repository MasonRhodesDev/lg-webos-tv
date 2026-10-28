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
    property alias page: page
    property alias categories: cats
    property alias dialog: dialog
    anchors.fill: parent

    // Opens at a target (pages.js target(): a category, a page id or an LG deep-link name); "" is the first page with
    // focus in the categories. Opening again while open goes to the new target.
    function openAt(target) {
        var ids = Pages.target(target), s = [];
        for (var i = 0; i < ids.length; i++) s.push({ "id": ids[i] });
        if (!s.length) s = [{ "id": Pages.topOf("picture") }];
        stack = s;
        area = ids.length ? "page" : "categories";
        cats.currentIndex = indexOfCategory(category);
        open = true;
        focusArea();
    }
    function close() {
        if (!open) return;
        open = false;
        closed();
    }
    function push(entry) {
        var s = stack.slice();
        s[s.length - 1].index = page.list.currentIndex;
        if (entry.id.indexOf("pick:") === 0 || entry.id.indexOf("adjust:") === 0) entry.sub = page.sub;
        s.push(entry);
        stack = s;
    }
    function pop() {
        if (stack.length > 1) { stack = stack.slice(0, stack.length - 1); return; }
        area = "categories";
        focusArea();
    }
    function indexOfCategory(id) {
        var c = Pages.categories(id);
        for (var i = 0; i < c.length; i++) if (c[i].category === id) return i;
        return 0;
    }
    function focusArea() { if (area === "page") page.forceActiveFocus(); else cats.forceActiveFocus(); }

    property var confirming: null

    Keys.onPressed: {
        if (!open) return;
        if (event.key === Qt.Key_Left && area === "page") { pop(); event.accepted = true; }
        else if (event.key === Qt.Key_Right && area === "categories") { area = "page"; focusArea(); event.accepted = true; }
    }

    // What the footer says about the connection.
    property var footerWatch: ["networkStatus"]
    onOpenChanged: { if (open) store.watch(footerWatch); else store.unwatch(footerWatch); }

    Panel {
        id: panel
        placement: "full"
        shown: menu.open
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
                onCurrentIndexChanged: {
                    var c = spec(currentIndex);
                    if (menu.open && menu.area === "categories" && c && c.category !== menu.category) menu.stack = [{ "id": Pages.topOf(c.category) }];
                }
                onActivated: { menu.area = "page"; menu.focusArea(); }
                onBack: menu.close()
            }
            Label {
                id: foot
                x: Look.px("space-xs")
                y: parent.height - height
                role: "caption"
                color: Look.color("ink-3")
                text: { var rev = menu.store.revision; return menu.store.state("networkStatus").label; }
            }
        }
        Divider {
            id: rule
            vertical: true
            x: side.width + Look.px("space-xl")
        }
        PageView {
            id: page
            x: rule.x + rule.width + Look.px("space-xl")
            width: parent.width - x
            height: parent.height
            headerInset: Look.px("space-s")
            store: menu.store
            pointer: menu.pointer
            active: menu.open
            entry: menu.topEntry
            crumb: menu.stack.length > 1 ? Pages.title(menu.stack[menu.stack.length - 2]) : ""
            sub: { var rev = menu.store.revision; return menu.topEntry ? menu.topEntry.sub || Pages.subtitle(Pages.expanded(menu.topEntry).sub, menu.store) : ""; }
            list.focusShown: menu.area === "page"
            onOpen: menu.push(entry)
            onDone: menu.pop()
            onBack: menu.pop()
            onAllSettings: {}
            onConfirm: menu.confirming = row
        }
    }

    Dialog {
        id: dialog
        shown: menu.confirming !== null
        title: menu.confirming ? menu.confirming.label : ""
        body: menu.confirming ? Pages.confirmation(menu.confirming, menu.store) : ""
        icon: menu.confirming ? menu.confirming.icon : ""
        hue: menu.confirming ? menu.confirming.hue : -1
        buttons: ["Cancel", "OK"]
        onShownChanged: if (shown) { currentIndex = 0; forceActiveFocus(); } else menu.focusArea()
        onActivated: { var r = menu.confirming; menu.confirming = null; if (index === 1) page.run(r); }
        onBack: menu.confirming = null
    }
}
