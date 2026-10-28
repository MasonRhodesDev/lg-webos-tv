import QtQuick 2.4
import Look 1.0
import "keys.js" as KeyMap

// A row of buttons with one focused. `buttons` is a list of labels or { label, icon, disabled }. Our own menus give
// it focus and it moves with Left/Right; an LG-mirrored surface sets currentIndex instead.
Row {
    id: bar
    property var buttons: []
    property int currentIndex: 0
    property bool focusShown: true
    signal activated(int index)
    signal back()
    spacing: Look.px("space-m")

    function spec(i) { var b = buttons[i]; return typeof b === "string" ? { "label": b } : b; }
    function move(d) {
        for (var i = currentIndex + d; i >= 0 && i < buttons.length; i += d)
            if (!spec(i).disabled) { currentIndex = i; return; }
    }
    Keys.onPressed: {
        var k = KeyMap.nav(event, Qt);
        if (k === "left") move(-1);
        else if (k === "right") move(1);
        else if (k === "ok") activated(currentIndex);
        else if (k === "back") back();
        else return;
        event.accepted = true;
    }

    Repeater {
        model: bar.buttons.length
        Button {
            readonly property var b: bar.spec(index)
            label: b.label || ""
            icon: b.icon || ""
            disabled: !!b.disabled
            focused: bar.focusShown && index === bar.currentIndex
        }
    }
}
