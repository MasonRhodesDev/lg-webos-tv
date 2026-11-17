import QtQuick 2.4

Item {
    objectName: "fakeLgQuickSettings"
    property var events: []
    function lifeCycle(payload) { events.push(payload); }
    Component.onCompleted: parent.lifeCycleStatusChanged.connect(lifeCycle)
}
