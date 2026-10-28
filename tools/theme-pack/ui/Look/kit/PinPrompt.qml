import QtQuick 2.4
import Look 1.0

// Asking for the PIN (the PIN prompt board): the picture dimmed, a centred glass panel `pin-w` wide with the lock in
// its well, the title and why, a slot per digit (filled ones hold a dot, the next one has the active edge) and the
// PinPad. Fill the screen with it and give it focus. When the last digit is in it emits entered(pin); the surface
// checks it and calls reject(text) to clear it and say why, or closes. Back is cancelled().
FocusScope {
    id: prompt
    property string title: "Enter PIN"
    property string body
    property string error
    property int length: 4
    property string pin
    property bool shown: true
    property bool pointer: true
    property alias pad: pad
    signal entered(string pin)
    signal cancelled()
    anchors.fill: parent

    function reset() { pin = ""; error = ""; pad.currentIndex = 0; }
    function reject(text) { pin = ""; error = text; }
    onShownChanged: if (shown) reset()

    Scrim { kind: "dim"; shown: prompt.shown }
    Panel {
        placement: "center"
        target: "dialog"
        width: Look.px("pin-w")
        shown: prompt.shown
        padding: Look.px("space-xxl")
        Column {
            width: parent.width
            spacing: Look.px("space-lx")
            Well { icon: "lock"; hue: 4; anchors.horizontalCenter: parent.horizontalCenter }
            Column {
                width: parent.width
                spacing: Look.px("space-xs")
                Label { role: "title"; text: prompt.title; anchors.horizontalCenter: parent.horizontalCenter }
                Label {
                    role: "body"
                    text: prompt.error || prompt.body
                    color: prompt.error ? Look.color("critical") : Look.color("ink-2")
                    anchors.horizontalCenter: parent.horizontalCenter
                }
            }
            Row {
                spacing: Look.px("space-ml")
                anchors.horizontalCenter: parent.horizontalCenter
                Repeater {
                    model: prompt.length
                    Rectangle {
                        readonly property bool next: index === prompt.pin.length
                        width: Look.px("slot-w")
                        height: Look.px("slot-h")
                        radius: Look.px("r-row")
                        color: Look.color("inner")
                        border.width: next ? Look.px("active-w") : Look.px("edge-w")
                        border.color: next ? Look.color("focus-edge") : Look.color("surface-edge")
                        Rectangle {
                            visible: index < prompt.pin.length
                            anchors.centerIn: parent
                            width: Look.px("slot-dot")
                            height: width
                            radius: width / 2
                            color: Look.color("ink")
                        }
                    }
                }
            }
            PinPad {
                id: pad
                focus: true
                pointer: prompt.pointer
                anchors.horizontalCenter: parent.horizontalCenter
                onDigit: {
                    if (prompt.pin.length >= prompt.length) return;
                    prompt.error = "";
                    prompt.pin += d;
                    if (prompt.pin.length === prompt.length) prompt.entered(prompt.pin);
                }
                onCleared: prompt.pin = ""
                onErased: prompt.pin = prompt.pin.slice(0, -1)
                onBack: prompt.cancelled()
            }
        }
    }
}
