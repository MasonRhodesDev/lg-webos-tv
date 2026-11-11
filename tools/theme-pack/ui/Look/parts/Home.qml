import QtQuick 2.4
import WebOSServices 1.0
import ".."
import "../settings"
import "inputs.js" as Inputs

// Our Home dock: a ribbon of inputs and apps along the bottom of the screen, over whatever is playing. A part of our
// own: it replaces no LG item.
//
// The Home key reaches it through a key filter of ours (ui/home-key.js, put in LG's chain by HomeKeyHook.qml) that
// launches our system UI entry (HomeEntry.qml), which emits SettingsBus.homeRequested. The key filter is installed
// only while Hook A's table carries that entry (SettingsBus.hook set): without the entry a launch would find nothing
// and Home would do nothing. A long press of Home, and any failure on the way, opens LG's Home instead.
//
// While open it holds focus in LG's focus chain at layer 7 and lives in LG's popup plane (Hold.qml), as our Settings
// does; the two never hold the plane at once. Back closes it, so does a second Home, a click outside the ribbon and a
// change of the app in front.
FocusScope {
    id: part
    // LG's root, from the layer that made this part, read once: while open the part sits in LG's popup plane (Hold.qml),
    // whose parent chain does not lead back to the layer.
    property Item host: null
    function findHost() { if (!host && parent && parent.host !== undefined) host = parent.host; }
    readonly property int layerNumber: 7
    anchors.fill: parent

    property bool open: false
    property alias ribbon: ribbon
    // LG's focus chain; tests give a stand-in with the same two functions.
    property url focusChain: Qt.resolvedUrl("../settings/LgFocus.qml")

    // What the dock shows, from the bus (refreshed on each open).
    property var inputs: []      // eim getAllInputStatus devices
    property var apps: []        // installed apps: removable launch points
    property bool drive: false   // a USB drive attached
    property string driveName: ""
    property string watching: "" // the app in front (an input's app id while watching one)
    property var hdmiSignal: null // tv.display getHDMIInfo, for the input being watched
    property bool online: true
    property var now: new Date()

    readonly property string usbApp: "com.webos.app.photovideo"
    readonly property string lgHomeApp: "com.webos.app.home"

    // { open, focus: { index, label }, tiles: [labels], keys: key filter installed }, for the tests and the TV suite.
    readonly property var probe: ({
        "open": open,
        "focus": open && ribbon.spec(ribbon.currentIndex) ? { "index": ribbon.currentIndex, "label": ribbon.spec(ribbon.currentIndex).label } : null,
        "tiles": tileLabels(tiles),
        "keys": keys.installed
    })
    function tileLabels(list) { var out = []; for (var i = 0; i < list.length; i++) out.push(list[i].label); return out; }

    HomeKeyHook { id: keys; host: part.host }
    FocusLink { id: focusLink; chain: part.focusChain }
    readonly property var focusHandler: focusLink.handler
    Hold { id: hold; host: part.host; item: part; onYielded: part.close() }

    // ---- the tiles

    // "4K · 60 Hz" from getHDMIInfo, for the input being watched.
    function format(s) {
        if (!s || !s.width) return "";
        var res = s.width >= 3840 ? "4K" : s.height >= 1080 ? "1080p" : s.height >= 720 ? "720p" : s.width + "×" + s.height;
        return s.frameRate ? res + " · " + Math.round(s.frameRate) + " Hz" : res;
    }
    readonly property var tiles: {
        var out = [], i;
        for (i = 0; i < inputs.length; i++) {
            var e = inputs[i], cur = e.appId === watching;
            var sub = cur && format(hdmiSignal) ? format(hdmiSignal) : e.activate ? "Signal" : "No signal";
            out.push({ "label": e.label || e.id, "sub": sub, "icon": Inputs.iconFor(e), "hue": Inputs.hueFor(e), "width": 230,
                       "current": cur, "badge": cur ? "Watching" : "", "badgeTone": "current", "appId": e.appId, "kind": "input" });
        }
        for (i = 0; i < apps.length; i++) {
            var a = apps[i], running = a.id === watching;
            out.push({ "label": a.title || a.id, "sub": "App", "image": a.icon ? "file://" + a.icon : "", "icon": a.icon ? "" : "grid",
                       "width": 220, "current": running, "badge": running ? "Watching" : "", "badgeTone": "current", "appId": a.id, "kind": "app" });
        }
        out.push({ "label": "USB", "sub": drive ? driveName || "USB drive" : "No drive", "icon": "usb", "hue": 5, "width": 220,
                   "disabled": !drive, "appId": usbApp, "kind": "usb" });
        out.push({ "label": "Settings", "sub": "System", "icon": "sliders", "width": 220, "kind": "settings" });
        out.push({ "label": "LG Home", "sub": "LG's apps", "icon": "home", "width": 220, "appId": lgHomeApp, "kind": "lghome" });
        return out;
    }
    // The bus answers after the dock is open, and each answer makes a new tile list, which resets the ribbon's focus.
    // The ribbon's model is set here rather than bound, so the reset is ours: focus goes back on the same tile (by kind
    // and app id), or on the input being watched.
    property string focusKey: ""
    property bool seating: false
    function keyOf(t) { return t ? t.kind + ":" + (t.appId || t.label) : ""; }
    function seat(key) {
        seating = true;
        ribbon.model = tiles;
        var at = -1;
        for (var i = 0; i < tiles.length && key; i++) if (keyOf(tiles[i]) === key) at = i;
        ribbon.currentIndex = at >= 0 ? at : watchedIndex();
        seating = false;
        focusKey = keyOf(tiles[ribbon.currentIndex]);
    }
    onTilesChanged: seat(open ? focusKey : "")
    function watchedIndex() {
        for (var i = 0; i < tiles.length; i++) if (tiles[i].current) return i;
        return 0;
    }

    // ---- open and close

    function requested(params) {
        if (open) close();
        else show();
    }
    function show() {
        if (open || retired) return;
        refresh();
        now = new Date();
        open = true;
        seat("");
        ribbon.positionViewAtIndex(ribbon.currentIndex, ListView.Contain);
    }
    function close() { open = false; }
    property bool holding: false
    onOpenChanged: {
        if (open && !holding) { holding = true; hold.take(); focusLink.request(part); ribbon.forceActiveFocus(); }
        else if (!open && holding) { holding = false; focusLink.release(part); hold.give(); }
    }

    function activate(t) {
        if (!t || t.disabled) return;
        close();
        if (t.kind === "settings") { Look.settingsRequested(""); return; }
        var params = t.kind === "lghome" ? { "category": "home" } : {};
        bus.call("luna://com.webos.applicationManager", "/launch", JSON.stringify({ "id": t.appId, "params": params }));
    }

    // ---- the bus

    property var bus: Service {
        appId: Look.busName
        onResponse: part.answer(method, payload)
    }
    function refresh() {
        bus.call("luna://com.webos.service.eim", "/getAllInputStatus", "{}");
        bus.call("luna://com.webos.applicationManager", "/listLaunchPoints", "{}");
        bus.call("luna://com.webos.service.attachedstoragemanager", "/listDevices", "{}");
        bus.call("luna://com.webos.service.connectionmanager", "/getstatus", "{}");
        bus.call("luna://com.webos.service.tv.display", "/getHDMIInfo", "{}");
    }
    function answer(method, payload) {
        var m;
        try { m = JSON.parse(payload); } catch (e) { return; }
        if (!m || m.returnValue === false) return;
        if (method === "/getAllInputStatus" && m.devices) inputs = m.devices;
        else if (method === "/listLaunchPoints" && m.launchPoints) {
            var mine = [];
            for (var i = 0; i < m.launchPoints.length; i++) if (m.launchPoints[i].removable) mine.push(m.launchPoints[i]);
            apps = mine;
        } else if (method === "/listDevices" && m.devices) {
            var found = null;
            for (var j = 0; j < m.devices.length; j++) if (!/^internal/.test(String(m.devices[j].deviceType))) found = m.devices[j];
            drive = found !== null;
            driveName = found ? found.deviceName || "" : "";
        } else if (method === "/getstatus") {
            online = m.isInternetConnectionAvailable === true;
        } else if (method === "/getHDMIInfo") {
            hdmiSignal = m.HDMImode ? m : null;
        }
    }

    // The app in front, on one standing subscription. Its first answer is where things stand, not a change.
    property bool heardForeground: false
    property var foreground: Service {
        appId: Look.busName
        onResponse: {
            var m;
            try { m = JSON.parse(payload); } catch (e) { return; }
            if (!m || m.appId === undefined) return;
            var changed = part.heardForeground && m.appId !== part.watching;
            part.heardForeground = true;
            part.watching = m.appId;
            if (changed && part.open) part.close();
        }
    }

    // ---- what it draws

    Timer { interval: 30000; repeat: true; running: part.open; onTriggered: part.now = new Date() }
    // A TV that has never had the network reads a year long past; its clock is not worth showing.
    readonly property bool clockSet: now.getFullYear() >= 2020

    // Behind the dock while it is open: a click outside it closes the dock instead of reaching the app underneath.
    MouseArea {
        anchors.fill: parent
        enabled: part.open
        hoverEnabled: enabled
        acceptedButtons: Qt.AllButtons
        onClicked: part.close()
        onWheel: wheel.accepted = true
    }

    Scrim { kind: "bottom"; shown: part.open }

    Panel {
        id: panel
        placement: "none"
        bare: true
        padding: 0
        shown: part.open
        readonly property real inset: 96
        x: inset
        width: part.width - 2 * inset
        y: part.height - 54 - height

        Header {
            id: head
            width: parent.width - status.width - Look.px("space-xl")
            title: "Inputs and apps"
        }
        Row {
            id: status
            anchors.right: parent.right
            y: (head.height - Look.px("space-m") - height) / 2
            spacing: Look.px("space-m")
            Badge { visible: !part.online; text: "Offline"; tone: "attention"; anchors.verticalCenter: parent.verticalCenter }
            Label {
                visible: part.clockSet
                role: "label"
                text: Qt.formatTime(part.now, "h:mm")
                anchors.verticalCenter: parent.verticalCenter
            }
        }

        TileRibbon {
            id: ribbon
            y: head.height + Look.px("space-s")
            width: parent.width
            tileHeight: 190
            spacing: 24
            focus: true
            focusShown: part.open
            onActivated: part.activate(tile)
            onCurrentIndexChanged: if (!part.seating) part.focusKey = part.keyOf(spec(currentIndex))
            onBack: part.close()
        }
        // The magic remote: pointing moves focus, a click activates. A sibling of the ribbon: inside it, it would
        // scroll with the tiles.
        MouseArea {
            x: ribbon.x
            y: ribbon.y
            width: ribbon.width
            height: ribbon.height
            enabled: part.open
            hoverEnabled: enabled
            function at(mx, my) { return ribbon.indexAt(mx + ribbon.contentX, my + ribbon.contentY); }
            onPositionChanged: { var i = at(mouse.x, mouse.y); if (ribbon.focusable(i)) ribbon.currentIndex = i; }
            onClicked: { var i = at(mouse.x, mouse.y); if (ribbon.focusable(i)) ribbon.activated(i, ribbon.spec(i)); }
        }

        KeyHints {
            id: hints
            anchors.right: parent.right
            y: ribbon.y + ribbon.height + Look.px("space-s")
            hints: [{ keys: ["left", "right"], label: "Move" }, { key: "OK", label: "Switch" }, { key: "BACK", label: "Close" }]
        }
    }

    // ---- life

    // Install the key filter while the table carries our entry; give LG's chain back when it does not.
    function follow() {
        if (retired) return;
        var live = SettingsBus.hook !== null && SettingsBus.hook.applied;
        if (live && !keys.installed) keys.install();
        else if (!live && (keys.installed || keys.wanted)) keys.restore();
    }

    Component.onCompleted: {
        findHost();
        SettingsBus.homeRequested.connect(part.requested);
        SettingsBus.hookChanged.connect(part.follow);
        if (host && host.keyFilter && host.keyFilter.backReleased) host.keyFilter.backReleased.connect(part.close);
        SettingsBus.homeReady = true;
        foreground.call("luna://com.webos.applicationManager", "/getForegroundAppInfo", JSON.stringify({ "subscribe": true }));
        refresh();
        follow();
    }

    // Gives back what this part took: the key filter chain, the focus chain and popup plane, the bus.
    property bool retired: false
    function retire() {
        if (retired) return;
        retired = true;
        keys.restore();
        close();
        hold.retire();
        SettingsBus.homeReady = false;
        SettingsBus.homeRequested.disconnect(part.requested);
        SettingsBus.hookChanged.disconnect(part.follow);
        try { if (host && host.keyFilter && host.keyFilter.backReleased) host.keyFilter.backReleased.disconnect(part.close); } catch (e) { }
        foreground.cancel();
    }
    Component.onDestruction: retire()
}
