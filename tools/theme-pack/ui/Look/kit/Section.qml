import QtQuick 2.4
import ".."

// A section header inside a list: the heading role, sitting on the section's first row. Not focusable.
Item {
    property string text
    width: parent ? parent.width : 0
    height: Look.px("section-h")
    Label {
        role: "heading"
        text: parent.text
        color: Look.color("ink-3")
        x: Look.px("row-pad")
        width: parent.width - 2 * x
        anchors.bottom: parent.bottom
        anchors.bottomMargin: Look.px("space-s")
    }
}
