import QtQuick 2.4
import ".."

// A line of text being typed (the Keyboard board): a `surface` box `field-h` tall, radius `r-row`, the text in the
// `entry` role with a caret in the focus colour after it, and, with a `maxLength`, a count ("9 / 20") beside it. While
// `active` (it takes what the keyboard types) its edge is `active-w` in `focus-edge`; otherwise the surface edge.
// `secret` shows dots, all but the last character typed, so a password can be checked as it goes in.
// Data in: `text` is the surface's; the field never changes it.
Item {
    id: field
    property string text
    property string placeholder
    property int maxLength: 0
    property bool secret: false
    property bool active: true
    readonly property string shown: {
        if (!secret || !text) return text;
        var s = "";
        for (var i = 0; i < text.length - 1; i++) s += "•";
        return s + text.charAt(text.length - 1);
    }
    width: parent ? parent.width : 0
    height: Look.px("field-h")

    Rectangle {
        id: box
        width: parent.width - (count.visible ? count.width + Look.px("space-ml") : 0)
        height: parent.height
        radius: Look.px("r-row")
        color: Look.color("surface")
        border.width: field.active ? Look.px("active-w") : Look.px("edge-w")
        border.color: field.active ? Look.color("focus-edge") : Look.color("surface-edge")

        Item {
            id: line
            x: Look.px("space-lx")
            width: parent.width - 2 * x
            height: parent.height
            clip: true
            Label {
                id: value
                role: "entry"
                text: field.shown || field.placeholder
                color: field.shown ? Look.color("ink") : Look.color("ink-3")
                elide: Text.ElideNone
                anchors.verticalCenter: parent.verticalCenter
                // Long text scrolls left so the caret stays in view.
                x: field.shown ? Math.min(0, line.width - caret.width - caret.gap - implicitWidth) : caret.width + caret.gap
            }
            Rectangle {
                id: caret
                readonly property real gap: Look.px("focus-w")
                visible: field.active
                x: field.shown ? value.x + value.implicitWidth + gap : 0
                width: Look.px("focus-w")
                height: Math.round(Look.px("type-entry") * 1.2)
                color: Look.color("focus")
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }
    Label {
        id: count
        visible: field.maxLength > 0
        role: "prompt"
        text: field.text.length + " / " + field.maxLength
        color: Look.color("ink-3")
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
    }
}
