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
    // `searchDepth` (how deep under the root its LG item sits, default 2).
    readonly property var parts: ["parts/VolumeBar.qml", "parts/Toast.qml"]

    function find(item, part, depth) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i] !== layer && part.claims(kids[i])) return kids[i];
            if (depth > 0) { var hit = find(kids[i], part, depth - 1); if (hit) return hit; }
        }
        return null;
    }

    Component.onCompleted: {
        for (var i = 0; i < parts.length; i++) {
            var c = Qt.createComponent(Qt.resolvedUrl(parts[i]));
            if (c.status === Component.Error) { Look.report("error", parts[i] + ": " + c.errorString()); continue; }
            var part = c.createObject(layer);
            if (!part) { Look.report("error", parts[i] + ": could not be created"); continue; }
            var lg = find(host, part, part.searchDepth !== undefined ? part.searchDepth : 2);
            if (!lg) { part.destroy(); Look.report("gap", parts[i] + ": LG item not found, left to LG"); continue; }
            lg.opacity = 0;
            part.lg = lg;
            Look.report("ok", parts[i] + ": drawn by own layer");
        }
    }
}
