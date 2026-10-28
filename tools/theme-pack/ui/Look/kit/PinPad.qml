import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A PIN keypad (the PIN prompt board): 1 to 9, Clear, 0 and Delete as Keys in three columns, `pad-w` wide, the `pad`
// role. Driven by the D-pad, and the remote's digit keys type straight in. Data out: digit(d), cleared(), erased(),
// back().
FocusScope {
    id: pad
    property bool focusShown: true
    property bool pointer: true
    property int currentIndex: 0
    readonly property var keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "Clear", "0", "Delete"]
    signal digit(string d)
    signal cleared()
    signal erased()
    signal back()
    readonly property real gap: 2 * Look.px("space-xs")
    width: Look.px("pad-w")
    height: 4 * Look.px("pad-key-h") + 3 * gap

    function press(i) {
        var k = keys[i];
        if (k === "Clear") cleared();
        else if (k === "Delete") erased();
        else digit(k);
    }
    Keys.onPressed: {
        var k = KeyMap.nav(event, Qt), i = currentIndex;
        if (k === "up") { if (i >= 3) currentIndex = i - 3; }
        else if (k === "down") { if (i < 9) currentIndex = i + 3; }
        else if (k === "left") { if (i % 3) currentIndex = i - 1; }
        else if (k === "right") { if (i % 3 < 2) currentIndex = i + 1; }
        else if (k === "ok") press(i);
        else if (k === "back") back();
        else if (event.key >= Qt.Key_0 && event.key <= Qt.Key_9) digit(String(event.key - Qt.Key_0));
        else return;
        event.accepted = true;
    }

    Grid {
        columns: 3
        spacing: pad.gap
        Repeater {
            model: pad.keys
            Key {
                width: (pad.width - 2 * pad.gap) / 3
                height: Look.px("pad-key-h")
                label: modelData
                role: "pad"
                pointer: pad.pointer
                focused: pad.focusShown && index === pad.currentIndex
                onClicked: { pad.currentIndex = index; pad.press(index); }
            }
        }
    }
}
