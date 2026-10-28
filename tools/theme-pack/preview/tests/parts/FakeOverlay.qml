import QtQuick 2.4

// Stands in for a part that replaces an LG overlay (Quick Settings): claimed on demand.
Item {
    property Item lg: null
    readonly property bool onDemand: true
    function claims(item) { return item.objectName === "windowContent" && item.numButtons !== undefined; }
}
