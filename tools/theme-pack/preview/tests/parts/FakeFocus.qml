import QtQuick 2.4

QtObject {
    property var log: []
    function request(item) { log.push("request " + item.layerNumber); item.forceActiveFocus(); }
    function release(item) { log.push("release " + item.layerNumber); }
}
