import QtQuick 2.4
import "."

Item {
    id: layer
    objectName: "themepackLayer"
    property Item host
    anchors.fill: parent
    z: 10008

    property var parts: ["parts/VolumeBar.qml", "parts/VolumeMute.qml", "parts/Toast.qml", "parts/Alert.qml", "parts/InputPicker.qml", "parts/Settings.qml", "parts/Home.qml"]

    readonly property int lateDepth: 3
    property var waiting: []

    property var pending: ({})
    property var probed: []
    readonly property string instance: String(new Date().getTime())
    function watchProbe(part, file) {
        if (part.probe === undefined) return;
        probed = probed.concat([{ "part": part, "file": file }]);
        part.probeChanged.connect(function () { if (layer.retired || !Look.probing) return; layer.pending[file] = part; probeTimer.restart(); });
    }
    function probingChanged() {
        if (retired) return;
        pending = {};
        if (Look.probing) for (var i = 0; i < probed.length; i++) publish(probed[i].file, probed[i].part);
    }
    function publish(file, part) { Look.probe(file, part.probe, instance); }
    function menuOpen() {
        for (var i = 0; i < probed.length; i++) {
            var p = probed[i].part.probe;
            if (p && ((p.menu && p.menu.open) || (p.quick && p.quick.open))) return true;
        }
        return false;
    }
    Timer {
        id: probeTimer
        interval: 50
        onTriggered: {
            var due = layer.pending;
            layer.pending = {};
            if (Look.probing) for (var f in due) layer.publish(f, due[f]);
        }
    }
    Timer {
        interval: layer.menuOpen() ? 1000 : 5000
        repeat: true
        running: Look.probing && !layer.retired && layer.probed.length > 0
        onTriggered: { for (var i = 0; i < layer.probed.length; i++) layer.publish(layer.probed[i].file, layer.probed[i].part); }
    }

    function find(item, part, depth) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i] !== layer && part.claims(kids[i])) return kids[i];
            if (depth > 0) { var hit = find(kids[i], part, depth - 1); if (hit) return hit; }
        }
        return null;
    }

    function claim(entry, lg) {
        lg.opacity = 0;
        entry.part.lg = lg;
        if (entry.claimed) return;
        entry.claimed = true;
        Look.report("ok", entry.file + ": drawn by own layer");
    }

    property var made: []
    property bool retired: false
    function retire() {
        if (retired) return;
        retired = true;
        unlink();
        for (var i = 0; i < made.length; i++) {
            var part = made[i];
            if (!part) continue;
            try { if (part.lg) part.lg.opacity = 1; } catch (e) { }
            try { if (typeof part.retire === "function") part.retire(); } catch (e) { Look.report("gap", "retire: " + e); }
        }
    }

    property var links: []
    function link(source, to) {
        source.connect(to);
        links.push({ "source": source, "to": to });
    }
    function unlink() {
        var all = links;
        links = [];
        for (var i = 0; i < all.length; i++) {
            try { all[i].source.disconnect(all[i].to); } catch (e) { }
        }
    }
    Component.onDestruction: unlink()

    function offer(root, depth) {
        for (var i = 0; i < waiting.length; i++) {
            var part = waiting[i].part;
            if (part.lg) continue;
            try {
                if (!root) return;
                var hit = part.claims(root) ? root : find(root, part, depth);
                if (hit) claim(waiting[i], hit);
            } catch (e) {
                return;
            }
        }
    }

    function watchViews() {
        var kids = host.children;
        for (var i = 0; i < kids.length; i++) {
            var view = kids[i];
            if (view.viewName === undefined || view.currentView === undefined) continue;
            (function (view) {
                layer.link(view.currentViewChanged, function () { layer.offer(view.currentView, layer.lateDepth); });
            })(view);
            offer(view.currentView, lateDepth);
        }
        if (host.notificationViewChanged !== undefined)
            link(host.notificationViewChanged, function () {
                var nv = host.notificationView;
                if (!nv) return;
                layer.link(nv.parentChanged, function () { layer.offer(nv.parent, 0); });
                layer.offer(nv.parent, 0);
            });
    }

    Component.onCompleted: {
        link(Look.probingChanged, layer.probingChanged);
        var late = [];
        for (var i = 0; i < parts.length; i++) {
            var c = Qt.createComponent(Qt.resolvedUrl(parts[i]));
            if (c.status === Component.Error) { Look.report("error", parts[i] + ": " + c.errorString()); continue; }
            var part = c.createObject(layer);
            if (!part) { Look.report("error", parts[i] + ": could not be created"); continue; }
            made.push(part);
            if (part.claims === undefined) { Look.report("ok", parts[i] + ": own part, no LG counterpart"); watchProbe(part, parts[i]); continue; }
            var lg = find(host, part, part.searchDepth !== undefined ? part.searchDepth : 2);
            var entry = { "part": part, "file": parts[i], "claimed": false };
            if (part.onDemand === true) {
                part.visible = Qt.binding((function (p) { return function () { return p.lg !== null; }; })(part));
                late.push(entry);
                watchProbe(part, parts[i]);
                if (lg) claim(entry, lg);
                continue;
            }
            if (!lg) { part.destroy(); Look.report("gap", parts[i] + ": LG item not found, left to LG"); continue; }
            claim(entry, lg);
            watchProbe(part, parts[i]);
        }
        waiting = late;
        if (late.length) watchViews();
        for (var j = 0; j < late.length; j++)
            if (!late[j].part.lg) Look.report("waiting", late[j].file + ": LG creates its item on demand, claimed when shown");
    }
}
