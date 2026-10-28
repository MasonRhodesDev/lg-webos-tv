import QtQuick 2.4
import Look 1.0

// The kit's text entry and PIN pieces, board 3. Base: the Keyboard board as drawn (Rename HDMI 3, "Game cons", focus on
// o). States: the PIN prompt board (two digits in, focus on 5), a wrong PIN, a password on the symbols layout, and the
// pieces alone in each state (fields active, idle, secret and empty; keys at rest, focused, current, disabled).
Item {
    id: kit
    width: 1920
    height: 1080
    property string mode: "keyboard"
    states: [
        State { name: "pin"; PropertyChanges { target: kit; mode: "pin" } StateChangeScript { script: { pin.pin = "12"; pin.pad.currentIndex = 4; } } },
        State { name: "pin-wrong"; PropertyChanges { target: kit; mode: "pin" } StateChangeScript { script: { pin.reject("Wrong PIN. Try again."); pin.pad.currentIndex = 9; } } },
        State { name: "password"; PropertyChanges { target: kit; mode: "password" } StateChangeScript { script: {
            entry.keyboard.layout = "symbols";
            entry.keyboard.row = 1;
            entry.keyboard.col = 8;
        } } },
        State { name: "pieces"; PropertyChanges { target: kit; mode: "pieces" } }
    ]

    Screen {
        TextPrompt {
            id: entry
            shown: kit.mode === "keyboard" || kit.mode === "password"
            label: kit.mode === "password" ? "Password for Home" : "Rename HDMI 3"
            text: kit.mode === "password" ? "tea4two@" : "Game cons"
            maxLength: kit.mode === "password" ? 63 : 20
            secret: kit.mode === "password"
            doneLabel: kit.mode === "password" ? "Join" : "Done"
            Component.onCompleted: { keyboard.row = 0; keyboard.col = 8; }
        }
        PinPrompt {
            id: pin
            shown: kit.mode === "pin"
            body: "Settings are locked"
        }

        Column {
            visible: kit.mode === "pieces"
            x: Look.px("safe-x")
            y: Look.px("safe-y")
            width: 1920 - 2 * x
            spacing: Look.px("space-l")

            Label { role: "heading"; text: "Fields: active · idle · secret · empty"; color: Look.color("ink-3") }
            TextField { width: 900; text: "Living room TV"; maxLength: 32 }
            TextField { width: 900; text: "Living room TV"; active: false }
            TextField { width: 900; text: "hunter22"; secret: true }
            TextField { width: 900; placeholder: "Network name" }

            Row {
                spacing: Look.px("space-xxl")
                PinPad { currentIndex: 10 }
                Column {
                    spacing: Look.px("space-m")
                    Label { role: "heading"; text: "Keys: rest · focused · current · disabled · word"; color: Look.color("ink-3") }
                    Row {
                        spacing: Look.px("key-gap")
                        Key { label: "q" }
                        Key { label: "w"; focused: true }
                        Key { label: "Done"; role: "cap-word"; current: true; width: Look.px("key-w") * 300 / 132 }
                        Key { label: "Join"; role: "cap-word"; current: true; disabled: true; width: Look.px("key-w") * 300 / 132 }
                        Key { label: "Space"; role: "cap-word"; width: Look.px("key-w") * 760 / 132 }
                    }
                }
                Column {
                    spacing: Look.px("space-m")
                    Label { role: "heading"; text: "Wells and the new icons"; color: Look.color("ink-3") }
                    Row {
                        spacing: Look.px("space-m")
                        Well { icon: "lock"; hue: 4 }
                        Well { icon: "wifi1"; hue: 3 }
                        Well { icon: "wifi2"; hue: 3 }
                        Well { icon: "wifi"; hue: 3 }
                        Well { icon: "keyboard"; hue: 1 }
                    }
                }
            }
        }
    }
}
