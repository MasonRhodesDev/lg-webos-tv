import QtQuick 2.4
import ".."

Rectangle {
    property bool vertical: false
    readonly property real thickness: Math.max(1, Math.ceil(Look.px("edge-w")))
    width: vertical ? thickness : (parent ? parent.width : 0)
    height: vertical ? (parent ? parent.height : 0) : thickness
    color: Look.color("divider")
}
