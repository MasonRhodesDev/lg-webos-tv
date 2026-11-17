import QtQuick 2.4

Item {
    property Item lg: null
    readonly property bool onDemand: true
    function claims(item) { return item.objectName === "windowContent" && item.numButtons !== undefined; }
}
