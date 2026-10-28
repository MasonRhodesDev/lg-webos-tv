import QtQuick 2.4
import Preview 1.0

// The gear button's quick sheet (the owner's Quick settings board), drawn by the real part against the settings mock
// (TvSettings). States open it through the part's own API (as Hook A does) and set focus with the kit lists' API.
Item {
    id: scene
    property rect frame: Qt.rect(0, 0, 960, 1080)
    readonly property var p: loader.item
    Loader { id: loader; anchors.fill: parent; source: Qt.resolvedUrl("../../ui/Look/parts/Settings.qml") }
    function list() { return p.quick.view.list; }
    function rowOf(label) { var l = list(); for (var i = 0; i < l.rows.length; i++) if (l.rows[i].label === label) return i; return 0; }

    // Base: the gear pressed, focus on the first row.
    Component.onCompleted: p.quickSettings(null)
    states: [
        State { name: "focus-volume"; StateChangeScript { script: list().currentIndex = rowOf("Volume") } },
        // Energy saving flipped and the volume stepped up twice, through the rows' own handlers.
        State { name: "changed"; StateChangeScript { script: {
            var l = list();
            l.currentIndex = rowOf("Energy saving");
            l.activated(l.currentIndex, l.rows[l.currentIndex]);
            l.currentIndex = rowOf("Volume");
            l.adjusted(l.currentIndex, 1);
            l.adjusted(l.currentIndex, 1);
        } } },
        State { name: "picker"; StateChangeScript { script: { p.quickSettings(null); p.quickSettings({ "activateType": "picture-mode" }); } } },
        State { name: "focus-all"; StateChangeScript { script: list().currentIndex = rowOf("All settings") } }
    ]
}
