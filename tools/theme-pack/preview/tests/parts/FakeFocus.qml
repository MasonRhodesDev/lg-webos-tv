import QtQuick 2.4

// Stands in for LG's focus chain (FocusLink.qml's `chain`): records requests and releases.
QtObject {
    property var log: []
    function request(item) { log.push("request " + item.layerNumber); item.forceActiveFocus(); }
    function release(item) { log.push("release " + item.layerNumber); }
}
