import QtQuick 2.4

// Stands in for LG's own Quick Settings window: it connects itself to its container, as LG's does, and records the
// lifecycle events it is given.
Item {
    objectName: "fakeLgQuickSettings"
    property var events: []
    function lifeCycle(payload) { events.push(payload); }
    Component.onCompleted: parent.lifeCycleStatusChanged.connect(lifeCycle)
}
