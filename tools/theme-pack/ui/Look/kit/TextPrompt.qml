import QtQuick 2.4
import ".."

// Typing a line of text (the Keyboard board): the picture dimmed, a `prompt` label over a TextField in the middle of
// the space above the keyboard, and the Keyboard on a ribbon panel along the bottom. Fill the screen with it and give
// it focus. It owns the text while open: `text` is where it starts. Done is accepted(text) (only once `minLength`
// characters are in), Back is cancelled().
FocusScope {
    id: prompt
    property string label
    property string text
    property string placeholder
    property int maxLength: 0
    property int minLength: 0
    property bool secret: false
    property string doneLabel: "Done"
    // The keys it opens on: letters, or symbols (digits first).
    property string layout: "letters"
    property bool shown: true
    property bool pointer: true
    property alias keyboard: keys
    property alias field: field
    signal accepted(string text)
    signal cancelled()
    anchors.fill: parent

    // Starts afresh each time it opens.
    onShownChanged: if (shown) { keys.reset(); keys.layout = layout; }

    Scrim { kind: "dim"; shown: prompt.shown }
    Scrim { kind: "bottom"; shown: prompt.shown }

    Item {
        anchors.fill: parent
        opacity: prompt.shown ? 1 : 0
        visible: opacity > 0
        Behavior on opacity { NumberAnimation { duration: Look.px(prompt.shown ? "motion-enter" : "motion-exit") } }

        Column {
            id: head
            x: Look.px("safe-x")
            width: parent.width - 2 * x
            y: (pad.y - height) / 2
            spacing: 2 * Look.px("space-xs")
            Label { role: "prompt"; text: prompt.label; color: Look.color("ink-2"); width: parent.width }
            TextField {
                id: field
                text: prompt.text
                placeholder: prompt.placeholder
                maxLength: prompt.maxLength
                secret: prompt.secret
            }
        }
    }
    Panel {
        id: pad
        placement: "ribbon"
        shown: prompt.shown
        padding: Look.px("space-lx")
        Keyboard {
            id: keys
            focus: true
            x: (parent.width - width) / 2
            pointer: prompt.pointer
            doneLabel: prompt.doneLabel
            doneEnabled: prompt.text.length >= prompt.minLength
            onTyped: if (prompt.maxLength <= 0 || prompt.text.length < prompt.maxLength) prompt.text += ch
            onErased: prompt.text = prompt.text.slice(0, -1)
            onDone: prompt.accepted(prompt.text)
            onBack: prompt.cancelled()
        }
    }
}
