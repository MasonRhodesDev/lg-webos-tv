import QtQuick 2.4
import Preview 1.0

Item {
    id: scene
    property rect frame: Qt.rect(0, 0, 960, 1080)
    readonly property var p: loader.item
    Loader { id: loader; anchors.fill: parent; source: Qt.resolvedUrl("../../ui/Look/parts/Settings.qml") }
    function list() { return p.quick.view.list; }
    function rowOf(label) { var l = list(); for (var i = 0; i < l.rows.length; i++) if (l.rows[i].label === label) return i; return 0; }

    Component.onCompleted: p.quickSettings(null)
    states: [
        State { name: "focus-volume"; StateChangeScript { script: list().currentIndex = rowOf("Volume") } },
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
