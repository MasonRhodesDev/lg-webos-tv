import QtQuick 2.4
import ".."

// Our toast (the short notice: "input changed", app and system notices), drawn where the SmokeOverlays board puts
// it. LG's toast view keeps its logic (the notification service subscription, queueing, the 5 s timeout); this only
// draws the toast LG is showing. LG's own pointer areas stay at the top right, where LG put them; a click on ours is
// handed to LG's toast, so it does what a click on LG's does.
Item {
    id: part
    property Item lg: null
    readonly property int searchDepth: 0
    readonly property bool onDemand: true
    function claims(item) { return item.objectName === "toastView" && item.model !== undefined && item.close !== undefined; }

    readonly property var model: lg ? lg.model : null
    // LG shows at most one toast at a time, the model's last row.
    readonly property var current: model && model.count > 0 ? model.get(model.count - 1) : null
    readonly property bool shown: lg !== null && lg.visible && current !== null
    readonly property var probe: ({ "shown": shown, "message": shown ? toast.message : "" })
    // Kept after LG removes the row, so the toast keeps its text while it leaves.
    property var toast: ({ "title": "", "message": "", "iconPath": "", "standard": true, "link": false })
    onCurrentChanged: if (current) toast = { "title": current.title || "", "message": current.message || "",
                                              "iconPath": current.iconPath || "", "standard": current.type === "standard",
                                              "link": !!current.action && Object.keys(current.action).length > 0 }

    anchors.fill: parent

    // LG's delegate for the shown toast (its Toast item): a click on a standard toast runs its action, then closes it.
    function lgToast(item, depth) {
        var kids = item ? item.children : [];
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].generalToast !== undefined && kids[i].activated !== undefined) return kids[i];
            if (depth > 0) { var hit = lgToast(kids[i], depth - 1); if (hit) return hit; }
        }
        return null;
    }

    ToastCard {
        id: card
        shown: part.shown
        title: part.toast.title
        message: part.toast.message
        image: part.toast.iconPath ? "file://" + part.toast.iconPath : ""
        hue: 1
        compact: !part.toast.standard
        link: part.toast.standard && part.toast.link
    }

    MouseArea {
        x: card.x
        y: card.y
        width: card.width
        height: card.height
        enabled: part.shown && part.toast.standard
        onClicked: {
            var t = part.lgToast(part.lg, 5);
            if (t) t.activated();
        }
    }
}
