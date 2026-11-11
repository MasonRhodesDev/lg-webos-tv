import QtQuick 2.4
import ".."

// Our input picker. LG's InputPickerMainView keeps all of its logic (the input list, keys, the 5 s hotkey timer,
// launching, eject, the add-on button's actions, the tooltip); this only draws what it shows. LG's tiles stay in the
// tree as the magic remote's hit areas, so ours keep LG's geometry and follow LG's scroll position.
Item {
    id: part
    property Item lg: null
    readonly property bool onDemand: true
    function claims(item) { return item.mainRibbon !== undefined && item.inputPickerListModel !== undefined; }

    // LG's geometry (its InputPicker style): the ribbon sits flush with the screen bottom once open, its tiles 300
    // by 210 (the Home Dashboard tile 280), 45 above the ribbon's foot, 10 apart; a category starts 10 further on and
    // the Home Dashboard tile's delegate carries 63 more for its separator.
    readonly property real lgTileH: 210
    readonly property real lgTileFoot: 45
    readonly property real lgSpacing: 10
    readonly property real lgCategoryLead: 10
    readonly property real lgSeparator: 63
    // The add-on button: 54 square, 50 above its tile.
    readonly property real lgAddon: 54
    readonly property real lgAddonBand: lgAddon + 50

    readonly property Item ribbonLg: lg ? lg.mainRibbon : null
    readonly property Item root: lg ? lg.parent : null
    readonly property bool shown: lg !== null && lg.visible && root !== null && root.state === "opened"
    readonly property string watching: root && root.props ? root.props.forgroundAppValue || "" : ""

    anchors.fill: parent

    // Our tiles, built from LG's model; `map` takes LG's index to ours (a separator follows the Home Dashboard tile).
    property var tiles: []
    property var map: []
    property int signals: 0
    property int inputs: 0

    function category(type) {
        var s = root && root.strings ? root.strings : null;
        if (!s) return "";
        return type === "usb" ? s.usb : type === "dlna" ? s.contentShare : type === "input" ? s.input : "";
    }
    function iconFor(e) {
        if (e.id === "titleItem") return "home";
        if (e.inputType === "usb") return "usb";
        if (e.inputType === "dlna") return "cast";
        if (String(e.appId).indexOf("livetv") >= 0) return "screen";
        if (String(e.appId).indexOf("hdmi") >= 0 || String(e.appId).indexOf("av") >= 0) return "port";
        return "grid";
    }
    // Each HDMI input keeps its own hue across the picker, the banner and the hotkey popup.
    function hueFor(e, i) {
        var m = /hdmi(\d+)/.exec(String(e.appId));
        if (m) return (parseInt(m[1], 10) - 1) % 4;
        if (e.id === "titleItem") return 6;
        if (e.inputType === "usb") return 5;
        if (e.inputType === "dlna") return 3;
        return 4;
    }
    function isCurrent(e) {
        if (e.id === "USB" || e.id === "DLNA" || e.id === "titleItem") return false;
        return e.appId === watching && (e.isSecondDepth ? e.lastUniqueId === e.uniqueId : true);
    }
    function rebuild() {
        var out = [], idx = [], on = 0, all = 0;
        var model = lg ? lg.inputPickerListModel : null;
        var n = model ? model.count : 0;
        for (var i = 0; i < n; i++) {
            var e = model.get(i);
            var title = e.id === "titleItem";
            var current = isCurrent(e);
            idx.push(out.length);
            out.push({
                label: title || e.label === "defaultTile" ? "Home" : e.label,
                sub: title ? "Dashboard" : e.subTitle || (e.activate ? "" : "No signal"),
                icon: iconFor(e),
                hue: hueFor(e, i),
                width: title ? 280 : 300,
                lead: e.hasCategory ? lgCategoryLead : 0,
                heading: e.hasCategory ? category(e.inputType) : "",
                disabled: !e.activate,
                current: current,
                badge: current ? "Watching" : ""
            });
            if (title) out.push({ separator: true, width: lgSeparator - lgSpacing });
            if (e.inputType === "input" && String(e.appId).indexOf("livetv") < 0) { all++; if (e.activate) on++; }
        }
        map = idx;
        signals = on;
        inputs = all;
        tiles = out;
        // A new model resets a ListView's currentIndex, which leaves the binding standing but stale.
        ribbon.currentIndex = Qt.binding(function () { return part.focusIndex; });
    }
    // LG fills its model from script after the view exists, and edits rows in place (a device's status).
    readonly property int lgCount: lg ? lg.inputPickerListModel.count : 0
    onLgCountChanged: rebuild()
    onLgChanged: {
        if (lg) lg.inputPickerListModel.dataChanged.connect(rebuild);
        rebuild();
    }
    onWatchingChanged: rebuild()
    onShownChanged: if (shown) rebuild()

    readonly property int focusIndex: ribbonLg && ribbonLg.currentIndex >= 0 && ribbonLg.currentIndex < map.length ? map[ribbonLg.currentIndex] : -1
    readonly property var probe: ({ "shown": shown, "focus": ribbonLg ? ribbonLg.currentIndex : -1, "tiles": lgCount })

    // LG's add-on button (eject, device connector, channel tuning) belongs to its focused tile. LG decides when it
    // shows and whether it holds focus; we draw it where LG's sits.
    function findAddon(item, depth) {
        if (!item) return null;
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].tooltipText !== undefined) return kids[i];
            if (depth > 0) { var hit = findAddon(kids[i], depth - 1); if (hit) return hit; }
        }
        return null;
    }
    readonly property Item addonLg: ribbonLg && ribbonLg.currentItem ? findAddon(ribbonLg.currentItem, 2) : null
    readonly property bool addonShown: addonLg !== null && addonLg.visible
    readonly property bool addonFocused: addonShown && addonLg.activeFocus
    readonly property string addonType: ribbonLg && ribbonLg.currentIndex >= 0 && lg.inputPickerListModel.count > ribbonLg.currentIndex
                                        ? lg.inputPickerListModel.get(ribbonLg.currentIndex).addonType : ""

    // LG's scroll position, read from where its focused tile sits: a ListView's contentX is only an estimate once its
    // delegates differ in width. Our ribbon lays out every tile unscrolled and moves as a whole to match.
    readonly property real scrollX: {
        var li = ribbonLg ? ribbonLg.currentItem : null, oi = ribbon.currentItem;
        if (li && oi) return oi.x - (li.x - ribbonLg.contentX);
        return ribbonLg ? ribbonLg.contentX - ribbonLg.originX : 0;
    }

    Scrim { kind: "bottom"; shown: part.shown }

    Panel {
        id: panel
        placement: "none"
        bare: true
        padding: 0
        shown: part.shown
        readonly property real tileTop: part.height - part.lgTileFoot - part.lgTileH
        x: part.ribbonLg ? part.ribbonLg.x : 40
        width: part.width - 2 * x
        y: tileTop - ribbon.y
        height: ribbon.y + ribbon.height

        Header {
            id: head
            width: parent.width - hints.width - Look.px("space-xxl")
            title: "Switch input"
            subtitle: part.inputs ? part.signals + " of " + part.inputs + " inputs have a signal" : ""
        }
        KeyHints {
            id: hints
            anchors.right: parent.right
            y: (head.height - Look.px("space-m") - height) / 2
            hints: [{ keys: ["left", "right"], label: "Move" }, { key: "OK", label: "Switch" }, { key: "BACK", label: "Close" }]
        }

        TileRibbon {
            id: ribbon
            // Clear of the header: the group headings, and LG's add-on button 50 above a tile.
            y: head.height + Math.max(Look.px("space-l") + headingSpace, part.lgAddonBand)
            x: -part.scrollX
            width: contentWidth
            tileHeight: part.lgTileH
            // LG's spacing, so every tile lands on LG's hit area.
            spacing: part.lgSpacing
            follows: false
            focusShown: !part.addonFocused
            model: part.tiles
            currentIndex: part.focusIndex
        }

        Button {
            id: addon
            visible: part.addonShown && ribbon.currentItem !== null
            readonly property Item slot: ribbon.currentItem
            icon: part.addonType === "usb" ? "eject" : "shortcut"
            focused: part.addonFocused
            pointer: false
            height: part.lgAddon
            x: slot ? ribbon.x + slot.x + slot.lead + (slot.width - slot.lead - width) / 2 : 0
            y: ribbon.y - part.lgAddonBand
        }
    }
}
