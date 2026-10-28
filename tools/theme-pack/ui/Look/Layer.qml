import QtQuick 2.4
import Look 1.0

// Our UI layer over LG's. Each part (parts/*.qml) draws one component and says which LG item it replaces with
// claims(item). LG's item stays in the tree with its logic running and is made invisible; the part reads it through
// its `lg` property. A part whose LG item is not found is not shown, LG's stays drawing, and the gap is reported.
Item {
    id: layer
    property Item host
    anchors.fill: parent
    z: 10008 // LG's volume layer; the screen saver (10010) stays above

    // Each file is one part. A part is an Item with `property Item lg` and `function claims(item)`; it may set
    // `searchDepth` (how deep under the root its LG item sits, default 2). A part of our own with no LG counterpart
    // (the Look picker) leaves out `claims`: nothing is searched for or hidden.
    // A part with `onDemand: true` replaces an item LG creates later and destroys again (system UI overlays, the
    // toast view). It waits instead of being a gap, is claimed whenever LG shows its item, and is visible only while
    // it holds one.
    property var parts: ["parts/VolumeBar.qml", "parts/Toast.qml"]

    // How deep under a system UI view's current item (its StarfishSystemUIContainer) an on-demand item may sit.
    readonly property int lateDepth: 3
    property var waiting: []

    function find(item, part, depth) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i] !== layer && part.claims(kids[i])) return kids[i];
            if (depth > 0) { var hit = find(kids[i], part, depth - 1); if (hit) return hit; }
        }
        return null;
    }

    // `entry` is { part, file, claimed }: it reports the first claim only, so LG reopening an overlay stays quiet.
    function claim(entry, lg) {
        lg.opacity = 0;
        entry.part.lg = lg;
        if (entry.claimed) return;
        entry.claimed = true;
        Look.report("ok", entry.file + ": drawn by own layer");
    }

    // LG just showed `root`: offer it, and what lies under it, to the on-demand parts that hold no item. LG's views
    // keep pointing at a destroyed container until they move on, so any read may throw.
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

    // LG's system UI views (overlay, home, nudge, screen remote) set currentView once a created item is ready.
    function watchViews() {
        var kids = host.children;
        for (var i = 0; i < kids.length; i++) {
            var view = kids[i];
            if (view.viewName === undefined || view.currentView === undefined) continue;
            (function (view) {
                view.currentViewChanged.connect(function () { offer(view.currentView, lateDepth); });
            })(view);
            offer(view.currentView, lateDepth);
        }
        // The notification view loads late; its toast view is its sibling, first under the loader, then under host.
        if (host.notificationViewChanged !== undefined)
            host.notificationViewChanged.connect(function () {
                if (host.notificationView) offer(host.notificationView.parent, 0);
            });
    }

    Component.onCompleted: {
        var late = [];
        for (var i = 0; i < parts.length; i++) {
            var c = Qt.createComponent(Qt.resolvedUrl(parts[i]));
            if (c.status === Component.Error) { Look.report("error", parts[i] + ": " + c.errorString()); continue; }
            var part = c.createObject(layer);
            if (!part) { Look.report("error", parts[i] + ": could not be created"); continue; }
            if (part.claims === undefined) { Look.report("ok", parts[i] + ": own part, no LG counterpart"); continue; }
            var lg = find(host, part, part.searchDepth !== undefined ? part.searchDepth : 2);
            var entry = { "part": part, "file": parts[i], "claimed": false };
            if (part.onDemand === true) {
                part.visible = Qt.binding((function (p) { return function () { return p.lg !== null; }; })(part));
                late.push(entry);
                if (lg) claim(entry, lg);
                continue;
            }
            if (!lg) { part.destroy(); Look.report("gap", parts[i] + ": LG item not found, left to LG"); continue; }
            claim(entry, lg);
        }
        waiting = late;
        if (late.length) watchViews();
        for (var j = 0; j < late.length; j++)
            if (!late[j].part.lg) Look.report("waiting", late[j].file + ": LG creates its item on demand, claimed when shown");
    }
}
