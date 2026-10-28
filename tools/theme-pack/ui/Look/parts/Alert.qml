import QtQuick 2.4
import Look 1.0

// Our alert dialog (SmokeAlert board): an app's or the system's question with buttons ("USB drive removed"). LG's
// alert view keeps its logic (the notification service, stacking, timeouts, focus and keys, button actions); this
// draws the alert LG has focused and shows which of its buttons has focus. LG's own pointer areas stay where LG put
// them; a click on one of ours is handed to LG's alert, so it does what a click on LG's button does.
Item {
    id: part
    property Item lg: null
    readonly property int searchDepth: 0
    readonly property bool onDemand: true
    function claims(item) { return item.objectName === "alertView" && item.model !== undefined && item.modalAlertsVisible !== undefined; }

    readonly property int count: lg && lg.model ? lg.model.count : 0
    // LG's delegate for the alert in front (an Alert item), and its buttons in order. Delegates come a frame after
    // the model changes, so they are looked up once the frame has passed.
    property Item alert: null
    property var lgButtons: []
    onCountChanged: pick.restart()
    Timer { id: pick; interval: 0; onTriggered: part.refresh() }

    function delegates(item, depth, out) {
        var kids = item ? item.children : [];
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].buttonModel !== undefined && kids[i].closeClicked !== undefined) out.push(kids[i]);
            else if (depth > 0) delegates(kids[i], depth - 1, out);
        }
        return out;
    }
    function buttonsOf(item, depth, out) {
        var kids = item ? item.children : [];
        for (var i = 0; i < kids.length; i++) {
            if (kids[i].widthBasis !== undefined && kids[i].highlighted !== undefined) out.push(kids[i]);
            else if (depth > 0) buttonsOf(kids[i], depth - 1, out);
        }
        return out;
    }
    function refresh() {
        var list = count > 0 ? delegates(lg, 5, []) : [], front = null;
        for (var i = 0; i < list.length; i++) if (list[i].focus) front = list[i];
        if (!front && list.length) front = list[0];
        if (front) {
            alert = front;
            lgButtons = buttonsOf(front, 4, []);
        }
    }

    readonly property bool shown: lg !== null && lg.visible && count > 0 && alert !== null
    readonly property int focusIndex: {
        for (var i = 0; i < lgButtons.length; i++) if (lgButtons[i] && lgButtons[i].activeFocus) return i;
        return -1;
    }
    readonly property var labels: {
        var b = alert && alert.buttonModel ? alert.buttonModel : [], out = [];
        for (var i = 0; i < b.length; i++) out.push(b[i].label || "");
        return out;
    }

    anchors.fill: parent

    Dialog {
        id: dialog
        shown: part.shown
        modal: part.alert ? !!part.alert.modal : false
        title: part.alert ? part.alert.title : ""
        body: part.alert ? part.alert.message : ""
        icon: "info"
        hue: 1
        buttons: part.labels
        currentIndex: part.focusIndex
        onActivated: if (part.alert) part.alert.buttonClicked(index)
    }
}
