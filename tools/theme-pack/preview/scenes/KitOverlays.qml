import QtQuick 2.4
import Look 1.0

// The kit's contact sheet, board 2 of 2: overlays. A tile ribbon in every tile state, toasts, a dialog, the volume
// rail and the scrims; and the chips, badges and icon set.
Item {
    width: 1920
    height: 1080

    Screen {
        Scrim { kind: "bottom" }

        Panel {
            placement: "ribbon"
            bare: true
            padding: 0
            Header { id: head; title: "Inputs"; subtitle: "Watching HDMI 2"; role: "label" }
            TileRibbon {
                id: tiles
                y: head.height + 16
                width: parent.width
                currentIndex: 4
                model: [
                    { label: "Home", sub: "Dashboard", icon: "home", hue: 6, width: 220 },
                    { separator: true },
                    { label: "HDMI 1", sub: "No signal", icon: "port", hue: 0 },
                    { label: "HDMI 2", sub: "4K · 120 Hz", icon: "port", hue: 1, current: true, badge: "Watching" },
                    { label: "HDMI 3", sub: "Signal", icon: "gamepad", hue: 2 },
                    { label: "Homebrew", sub: "App", icon: "flask", hue: 4, chip: "2" },
                    { label: "USB", sub: "No drive", icon: "usb", hue: 5, disabled: true }
                ]
            }
            KeyHints {
                y: tiles.y + tiles.height + Look.px("space-l")
                hints: [{ keys: ["left", "right"], label: "Move" }, { key: "OK", label: "Switch" }, { key: "BACK", label: "Close" }]
            }
        }

        // Toasts take the top-right corner; here they step left of the rail so both show.
        ToastCard {
            placement: "none"
            x: 1920 - 96 - 112 - 40 - width
            y: 54
            title: "HDMI 2 connected"
            message: "PlayStation 5 · 4K 120 Hz. Game optimiser switched on for this input."
            icon: "gamepad"
            hue: 2
            link: true
        }
        ToastCard {
            y: 54 + 170
            x: 1920 - 96 - 112 - 40 - width
            placement: "none"
            compact: true
            icon: "speaker"
            hue: 1
            message: "Sound out: TV speakers"
        }

        // Chips and badges.
        Column {
            x: 96
            y: 54
            spacing: Look.px("space-s")
            Label { role: "heading"; text: "Chips and badges"; color: Look.color("ink-3") }
            Row {
                spacing: Look.px("space-s")
                Chip { text: "2" }
                Chip { text: "!"; tone: "critical" }
                Chip { text: "12"; tone: "neutral" }
                Badge { text: "Watching"; anchors.verticalCenter: parent.verticalCenter }
                Badge { text: "Live"; tone: "current"; anchors.verticalCenter: parent.verticalCenter }
                Badge { text: "New"; tone: "attention"; anchors.verticalCenter: parent.verticalCenter }
            }
        }

        // The icon set.
        Column {
            x: 1100
            y: 545
            spacing: Look.px("space-s")
            Label { role: "heading"; text: "Icons"; color: Look.color("ink-3") }
            Grid {
                columns: 10
                spacing: 16
                Repeater {
                    model: ["port", "flask", "usb", "sliders", "screen", "speaker", "moon", "leaf", "power", "palette",
                            "sparkle", "wifi", "grid", "help", "person", "check", "close", "home", "bell", "info",
                            "warning", "mute", "clock", "aspect", "eq", "gamepad", "plus", "minus", "back", "drill"]
                    Icon { name: modelData; color: Look.hue(index); size: 30 }
                }
            }
        }

        // Centred in the space above the ribbon, for the board; a real dialog fills the screen.
        Item {
            y: 170
            width: 1300
            height: 540
            Dialog {
                modal: false
                title: "USB drive removed"
                icon: "usb"
                hue: 1
                body: "The drive was unplugged while it was in use. Files that were being copied may be incomplete."
                buttons: ["Open USB media", "OK"]
                currentIndex: 1
            }
        }

        Panel {
            placement: "rail"
            y: 54
            height: 600
            padding: Look.px("space-m")
            Label {
                id: level
                role: "numeral"
                text: "21"
                anchors.horizontalCenter: parent.horizontalCenter
            }
            Slider {
                vertical: true
                fraction: 0.21
                length: 600 - 2 * Look.px("space-m") - level.height - Look.px("space-l") - 72
                y: level.height + Look.px("space-l")
                anchors.horizontalCenter: parent.horizontalCenter
            }
            Icon {
                name: "speaker"
                color: Look.color("ink-2")
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.bottom: parent.bottom
            }
        }

        Row {
            x: 1100
            y: 360
            spacing: 24
            Repeater {
                model: ["dim", "left", "bottom"]
                Item {
                    width: 180
                    height: 110
                    Rectangle { anchors.fill: parent; radius: 16; color: "transparent"; border.width: 1.5; border.color: Look.color("surface-edge") }
                    Item { anchors.fill: parent; anchors.margins: 2; clip: true; Scrim { kind: modelData; extent: kind === "bottom" ? 100 : 170 } }
                    Label { role: "caption"; text: "Scrim: " + modelData; anchors.horizontalCenter: parent.horizontalCenter; y: parent.height + 8; color: Look.color("ink-2") }
                }
            }
        }
    }
}
