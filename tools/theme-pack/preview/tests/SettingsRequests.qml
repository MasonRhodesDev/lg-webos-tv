import QtQuick 2.4
import QtQuick.Window 2.2
import Preview 1.0
import Look 1.0

// Look.settingsRequested against the Look service's answers: the first answer of a subscription only records where
// requests stand, a new `at` with open: true is a request, a close is not. Exits 1 on the first failure:
// qml SettingsRequests.qml
Window {
    id: win
    width: 320; height: 180
    visible: true

    property var heard: []
    property int step: 0

    function answer(settings) {
        return JSON.stringify({ "returnValue": true, "look": { "style": "smoke", "themes": [] },
                                "style": { "id": "smoke", "tokens": {} }, "themes": [], "settings": settings });
    }
    function check(ok, what) {
        console.log((ok ? "PASS " : "FAIL ") + what);
        if (!ok) { Qt.exit(1); throw new Error("settings requests: failed"); }
    }

    readonly property var steps: [
        function () {
            // Look subscribed when it was created; this is its subscription's first full answer.
            Fixture.load(answer({ "open": true, "target": "Sound", "at": 100 }));
            check(Look.online && Look.styleId === "smoke" && heard.length === 0, "an open Settings in the first answer is not a request");
            Fixture.load(answer({ "open": true, "target": "PictureMode", "at": 200 }));
            check(heard.length === 1 && heard[0] === "PictureMode", "a new open request names its page");
            Fixture.load(answer({ "open": true, "target": "PictureMode", "at": 200 }));
            check(heard.length === 1, "the same `at` again is not a new request");
            Fixture.load(answer({ "open": true, "target": "", "at": 300 }));
            check(heard.length === 2 && heard[1] === "", "a request without a page asks for the top");
            Fixture.load(answer({ "open": false, "target": "", "at": 400 }));
            check(heard.length === 2, "a close is not a request");
            console.log("settings requests: all passed");
            Qt.quit();
        }
    ]

    Timer {
        interval: 50
        repeat: true
        running: true
        onTriggered: { win.steps[win.step++](); if (win.step >= win.steps.length) stop(); }
    }
    Timer { interval: 10000; running: true; onTriggered: { console.error("settings requests: timed out"); Qt.exit(1); } }

    Connections {
        target: Look
        onSettingsRequested: win.heard.push(target)
    }
}
