import QtQuick 2.4
import ".."

// Borrows LG's popup plane for one of our parts while it is open (parts/Settings.qml, parts/Home.qml).
// LG's key filter hands Back to the focused item only in a few cases; one is "LG's popup plane has focus and no popup
// in it claims Back". Otherwise it emits backReleased and LG goes Home. So while a menu of ours is open it lives inside
// the popup plane, which is shown for the time (it hides itself when empty) and raised to our layer's height (in its
// own place LG's views above it would take the pointer).
//
// Only one part may hold the plane. take() first says so on SettingsBus.planeWanted; a holder that hears another one
// ask emits `yielded`, and its part closes at once (and so gives the plane back) before the new holder takes it.
// Otherwise the two would put the plane's z and visibility back in the wrong order and leave it hidden.
QtObject {
    id: hold
    property Item host
    // The part that moves into the plane.
    property Item item
    // Another part wants the plane: close now, synchronously, and call give().
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
    // Idempotent: the part's retire() and its destruction both call it.
    property bool done: false
    function retire() {
        if (done) return;
        done = true;
        SettingsBus.planeWanted.disconnect(hold.wanted);
        give();
    }
}
