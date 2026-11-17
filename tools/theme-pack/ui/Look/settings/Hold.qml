import QtQuick 2.4
import ".."

QtObject {
    id: hold
    property Item host
    property Item item
    signal yielded()

    property Item plane: null
    property Item home: null
    property real planeZ: 0
    readonly property bool held: plane !== null

    function findPopupPlane() {
        var kids = host ? host.children : [];
        for (var i = 0; i < kids.length; i++)
            if (kids[i].backKeyFilter !== undefined && kids[i].currentView !== undefined && kids[i].layerNumber === 6) return kids[i];
        return null;
    }
    function take() {
        if (held) return true;
        SettingsBus.planeWanted(hold);
        var p = findPopupPlane();
        if (!p) { Look.report("gap", "popup plane not found; Back goes to LG while ours is open"); return false; }
        plane = p;
        home = item.parent;
        planeZ = p.z;
        p.z = home ? home.z : p.z;
        p.visible = true;
        item.parent = p;
        return true;
    }
    function give() {
        if (!plane) return;
        var p = plane;
        plane = null;
        item.parent = home;
        p.z = planeZ;
        p.visible = Qt.binding(function () { return p.model.count > 0; });
    }
    function wanted(other) { if (other !== hold && held) yielded(); }

    Component.onCompleted: SettingsBus.planeWanted.connect(hold.wanted)
    property bool done: false
    function retire() {
        if (done) return;
        done = true;
        SettingsBus.planeWanted.disconnect(hold.wanted);
        give();
    }
}
