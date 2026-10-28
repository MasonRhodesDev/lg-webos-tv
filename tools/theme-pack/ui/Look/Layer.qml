import QtQuick 2.4
import Look 1.0

// Our UI layer over LG's. For each component we draw, LG's item stays in the tree with its logic running and is
// made invisible; if LG's item is not found, it is left drawing and the gap is reported.
Item {
    id: layer
    property Item host
    anchors.fill: parent
    z: 10008 // LG's volume layer; the screen saver (10010) stays above

    property Item lgVolume: null

    VolumeBar {
        lg: layer.lgVolume
        anchors.right: parent.right
        anchors.rightMargin: 64
        anchors.verticalCenter: parent.verticalCenter
    }

    function find(item, test, depth) {
        var kids = item.children;
        for (var i = 0; i < kids.length; i++) {
            if (kids[i] !== layer && test(kids[i])) return kids[i];
            if (depth > 0) { var hit = find(kids[i], test, depth - 1); if (hit) return hit; }
        }
        return null;
    }

    Component.onCompleted: {
        var v = find(host, function (o) { return o.audioService !== undefined && o.volumeMaxLevel !== undefined; }, 2);
        if (v) { v.opacity = 0; lgVolume = v; Look.report("ok", "volume: drawn by own layer"); }
        else Look.report("gap", "volume: LG item not found, left to LG");
    }
}
