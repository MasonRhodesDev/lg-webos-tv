import QtQuick 2.4
import ".."
import "inputs.js" as Inputs

Item {
    id: part
    property Item lg: null
    readonly property bool onDemand: true
    function claims(item) { return item.mainRibbon !== undefined && item.inputPickerListModel !== undefined; }

    readonly property real lgTileH: 210
    readonly property real lgTileFoot: 45
    readonly property real lgSpacing: 10
    readonly property real lgCategoryLead: 10
    readonly property real lgSeparator: 63
    readonly property real lgAddon: 54
    readonly property real lgAddonBand: lgAddon + 50

    readonly property Item ribbonLg: lg ? lg.mainRibbon : null
    readonly property Item root: lg ? lg.parent : null
    readonly property bool shown: lg !== null && lg.visible && root !== null && root.state === "opened"
    readonly property string watching: root && root.props ? root.props.forgroundAppValue || "" : ""

    anchors.fill: parent

    property var tiles: []
    property var map: []
    property int signals: 0
    property int inputs: 0

    function category(type) {
        var s = root && root.strings ? root.strings : null;
        if (!s) return "";
        return type === "usb" ? s.usb : type === "dlna" ? s.contentShare : type === "input" ? s.input : "";
    }
    function iconFor(e) { return Inputs.iconFor(e); }
    function hueFor(e, i) { return Inputs.hueFor(e); }
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
        ribbon.currentIndex = Qt.binding(function () { return part.focusIndex; });
    }
    readonly property int lgCount: lg ? lg.inputPickerListModel.count : 0
    onLgCountChanged: rebuild()
    onLgChanged: {
        watchModel(lg ? lg.inputPickerListModel : null);
        rebuild();
    }
    property var lgModel: null
    function watchModel(model) {
        if (lgModel === model) return;
        try { if (lgModel) lgModel.dataChanged.disconnect(part.rebuild); } catch (e) { }
        lgModel = model;
        if (lgModel) lgModel.dataChanged.connect(part.rebuild);
    }
    Component.onDestruction: watchModel(null)
    onWatchingChanged: rebuild()
    onShownChanged: if (shown) rebuild()

    readonly property int focusIndex: ribbonLg && ribbonLg.currentIndex >= 0 && ribbonLg.currentIndex < map.length ? map[ribbonLg.currentIndex] : -1
    readonly property var probe: ({ "shown": shown, "focus": ribbonLg ? ribbonLg.currentIndex : -1, "tiles": lgCount })

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
            y: head.height + Math.max(Look.px("space-l") + headingSpace, part.lgAddonBand)
            x: -part.scrollX
            width: contentWidth
            tileHeight: part.lgTileH
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
