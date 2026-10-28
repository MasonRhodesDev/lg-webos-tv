import QtQuick 2.4
import Look 1.0

// A rule between two parts of a surface (DESIGN.md, Surface): `divider`, the surface edge's width rounded up to a
// whole pixel. Horizontal fills its width; `vertical` fills its height (the Settings frame between categories and
// the page).
Rectangle {
    property bool vertical: false
    readonly property real thickness: Math.max(1, Math.ceil(Look.px("edge-w")))
    width: vertical ? thickness : (parent ? parent.width : 0)
    height: vertical ? (parent ? parent.height : 0) : thickness
    color: Look.color("divider")
}
