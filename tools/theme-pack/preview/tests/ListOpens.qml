import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// Where a list opens: a RowList with focus deep in it, inside a Panel under a Header (the Kit's Look panel), must
// open at its top when the focused row fits, whatever sizes the panel passes through while it is laid out, and must
// scroll just enough when it does not. Takes the Look service's payload (a style) after `--`. Exits 1 on the first
// failure: qml ListOpens.qml -- PAYLOAD_JSON
Window {
    id: win
    width: 1920; height: 1080
    visible: true

    readonly property var args: Qt.application.arguments.slice(Qt.application.arguments.indexOf("--") + 1)
    readonly property var rows: [
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

    Component {
        id: scene
        Screen {
            property alias tallList: tall
            property alias shortList: low
            Panel {
                x: 96 + Look.px("panel-w") + 40
                y: 54
                width: 1920 - 96 - x - 460 - 40
                height: 1080 - 108
                Header { id: head; crumb: "Settings"; title: "Look"; subtitle: "One style, any themes" }
                RowList { id: tall; y: head.height; width: parent.width; height: parent.height - y; currentIndex: 3; model: win.rows }
            }
            Panel {
                x: 1460
                y: 54
                width: 400
                height: 3 * Look.px("row-h-2") + Look.px("section-h") + 2 * Look.px("space-l")
                Header { id: head2; title: "Short" }
                RowList { id: low; y: head2.height; width: parent.width; height: parent.height - y; currentIndex: 7; model: win.rows }
            }
        }
    }

    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) { Qt.exit(1); throw new Error("list opens: failed"); }
    }
    property var made: null

    Timer {
        id: settle
        interval: 600
        onTriggered: {
            var tall = win.made.tallList, low = win.made.shortList, item = low.currentItem;
            check(tall.height > 0 && tall.contentY === tall.originY,
                  Look.styleId + ": a list whose focused row fits opens at its top, header first (contentY " + tall.contentY + ")");
            check(item && item.y >= low.contentY && item.y + item.height <= low.contentY + low.height,
                  Look.styleId + ": a list whose focused row is below the fold scrolls it into view");
            check(low.contentY > low.originY, Look.styleId + ": ... and only then does it open scrolled");
            console.log("list opens: all passed");
            Qt.quit();
        }
    }
    Timer { interval: 10000; running: true; onTriggered: { console.error("list opens: timed out"); Qt.exit(1); } }

    Component.onCompleted: {
        Fixture.load(args[0]);
        made = scene.createObject(win.contentItem);
        settle.start();
    }
}
