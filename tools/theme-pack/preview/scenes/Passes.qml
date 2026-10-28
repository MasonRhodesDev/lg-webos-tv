import QtQuick 2.4
import Look 1.0

// The layer model's render order (DESIGN.md, Layers), set up as the canvas's boards 3 and 5: three sibling tiles,
// tile 1 with a chip, focus on the middle one (option C: tiles 1 and 3 in passes, tile 2's whole stack last) or on
// tile 3 (tile 1's chip over the resting tile 2's decoration); and a panel of rows, one with a chip, whose
// decoration reaches into the panel's margin.
Item {
    id: scene
    width: 1920
    height: 1080
    property int focusAt: 1
    readonly property var frame: ({ "x": 96, "y": 120, "width": 1728, "height": 760 })

    states: [
        State { name: "middle"; PropertyChanges { target: scene; focusAt: 1 } },
        State { name: "right"; PropertyChanges { target: scene; focusAt: 2 } }
    ]

    Screen {
        Row {
            x: 220
            y: 260
            spacing: Look.px("space-m")
            Tile { label: "Live TV"; sub: "Channel 7"; icon: "screen"; hue: 0; chip: "3"; focused: scene.focusAt === 0 }
            Tile { label: "Movies"; sub: "4 new"; icon: "sparkle"; hue: 3; focused: scene.focusAt === 1 }
            Tile { label: "Music"; sub: "Paused"; icon: "speaker"; hue: 5; focused: scene.focusAt === 2 }
        }
        Panel {
            x: 1120
            y: 200
            width: 600
            Header { id: head; title: "Notifications" }
            RowList {
                y: head.height
                width: parent.width
                height: 3 * Look.px("row-h") + 2 * Look.px("space-s")
                currentIndex: scene.focusAt === 2 ? 2 : 1
                model: [
                    { variant: "nav", label: "Messages", icon: "bell", hue: 1, chip: "3" },
                    { variant: "toggle", label: "Do not disturb", icon: "clock", hue: 4, on: true },
                    { variant: "nav", label: "History", icon: "info", hue: 6 }
                ]
            }
        }
    }
}
