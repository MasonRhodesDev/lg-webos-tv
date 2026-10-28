import QtQuick 2.4
import Look 1.0

// The kit's contact sheet, board 1 of 2: panels, headers, every row variant and the controls in every state.
// Chips, badges and the icon set are on board 2.
Item {
    width: 1920
    height: 1080

    Screen {
        Scrim { kind: "left" }

        // A side panel as Quick Settings uses it: every row variant, one focused.
        Panel {
            placement: "side-left"
            Header { id: qsHead; title: "Quick settings"; subtitle: "HDMI 2 · 4K" }
            RowList {
                y: qsHead.height
                width: parent.width
                height: parent.height - y - hints.height - Look.px("space-l")
                currentIndex: 1
                model: [
                    { variant: "value", label: "Picture mode", value: "Filmmaker", icon: "screen", hue: 0 },
                    { variant: "stepper", label: "Sound mode", icon: "eq", hue: 1, options: ["Standard", "Cinema", "Clear voice", "Music"], index: 1 },
                    { variant: "toggle", label: "Energy saving", icon: "leaf", hue: 2, on: true },
                    { variant: "toggle", label: "Game optimiser", icon: "gamepad", hue: 3, on: false },
                    { variant: "slider", label: "Volume", icon: "speaker", hue: 5, fraction: 0.21, valueText: 21 },
                    { variant: "nav", label: "Sleep timer", value: "Off", icon: "clock", hue: 4 },
                    { variant: "nav", label: "Network", hint: "Not connected", icon: "wifi", hue: 6, disabled: true },
                    { variant: "nav", label: "All settings", icon: "sliders", hue: 6 }
                ]
            }
            KeyHints {
                id: hints
                anchors.bottom: parent.bottom
                hints: [{ keys: ["up", "down"], label: "Move" }, { keys: ["left", "right"], label: "Change" }, { key: "BACK", label: "Close" }]
            }
        }

        // A sub-page as our Settings uses it: breadcrumb, sections, radio and check rows.
        Panel {
            x: 96 + Look.px("panel-w") + 40
            y: 54
            width: 1920 - 96 - x - 460 - 40
            height: 1080 - 108
            Header { id: lookHead; crumb: "Settings"; title: "Look"; subtitle: "One style, any themes" }
            RowList {
                y: lookHead.height
                width: parent.width
                height: parent.height - y
                currentIndex: 3
                model: [
                    { section: "Style" },
                    { variant: "radio", label: "Smoke", hint: "Smoked glass, hot-pink focus", icon: "palette", hue: 0, checked: true },
                    { variant: "radio", label: "Bubble", hint: "Rounded and bright", icon: "palette", hue: 3 },
                    { variant: "radio", label: "Classic", hint: "Like the TV came", icon: "palette", hue: 5 },
                    { section: "Themes" },
                    { variant: "check", label: "Glow", icon: "sparkle", hue: 4, checked: true },
                    { variant: "check", label: "Halloween", icon: "sparkle", hue: 1 },
                    { variant: "check", label: "Winter", hint: "Needs a newer style", icon: "sparkle", hue: 3, disabled: true },
                    { variant: "info", label: "Saved on this TV", value: "Just now", icon: "info" }
                ]
            }
        }

        // States: each control and row at rest, focused, current and disabled.
        Column {
            x: 1920 - 96 - 460
            y: 54
            width: 460
            spacing: Look.px("space-s")

            Label { role: "heading"; text: "Rows: current · focused disabled"; color: Look.color("ink-3") }
            ListRow { variant: "nav"; label: "Picture"; icon: "screen"; hue: 0; current: true }
            ListRow { variant: "toggle"; label: "Locked"; icon: "power"; hue: 2; on: true; disabled: true; focused: true }
            Label { role: "heading"; text: "Controls on focus"; color: Look.color("ink-3") }
            ListRow { variant: "toggle"; label: "Subtitles"; icon: "screen"; hue: 2; on: true; focused: true }
            ListRow { variant: "slider"; label: "Bass"; icon: "eq"; hue: 4; fraction: 0.7; valueText: "7"; focused: true }
            ListRow { variant: "check"; label: "Glow"; icon: "sparkle"; hue: 3; checked: true; focused: true }

            Label { role: "heading"; text: "Controls"; color: Look.color("ink-3") }
            Row {
                spacing: Look.px("space-m")
                Toggle { on: true }
                Toggle { on: false }
                Toggle { on: true; disabled: true }
                Radio { checked: true }
                Radio { checked: false }
                Check { checked: true }
                Check { checked: false }
            }
            Slider { length: 460; fraction: 0.62 }
            Stepper { options: ["Off", "10 min", "30 min", "1 hour"]; index: 2; valueWidth: 200 }

            Label { role: "heading"; text: "Buttons"; color: Look.color("ink-3") }
            Row {
                spacing: Look.px("space-m")
                Button { label: "Cancel" }
                Button { label: "OK"; focused: true; hue: 2 }
                Button { label: "Off"; disabled: true }
            }
        }
    }
}
