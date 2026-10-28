import QtQuick 2.4
import QtQuick.Window 2.2
import Look 1.0
import Preview 1.0

// Renders a scene at 1920x1080 over a stand-in picture and saves it:
//   qml Shot.qml -- SCENE.qml PAYLOAD_JSON OUT.png [STATE]
//   qml Shot.qml -- SCENE.qml PAYLOAD_JSON --states      (prints the scene's state names and frame, for render.mjs)
//
// A scene is an Item. It names what to draw in one of three ways:
//   - `part: "VolumeBar.qml"` and `lg`: one part from ui/Look/parts, given LG's item as the part sees it.
//   - `parts: [{ part: "Toast.qml", lg: item }, ...]`: several parts; `lg` may be left out for a part of our own.
//   - neither: the scene draws itself (a whole menu of our own); it is laid over the picture.
// A scene may declare QML `states` (what LG's item is doing: a row focused, a picker open); STATE applies one by name.
// A scene may set `frame` (a rect) to the part of the shot that matters, which the contact sheet shows.
// A part with `claims` must claim its `lg`, so a mock can't drift from what the part looks for on the TV.
Window {
    id: win
    width: 1920; height: 1080
    visible: true
    color: "#000000"

    readonly property var args: Qt.application.arguments.slice(Qt.application.arguments.indexOf("--") + 1)
    property var scene: null
    property var placed: []

    Image { anchors.fill: parent; source: Qt.resolvedUrl("backdrop.png"); fillMode: Image.PreserveAspectCrop }
    Item { id: sceneLayer; anchors.fill: parent }
    Item { id: stage; anchors.fill: parent }

    function fail(text) { console.error("shot: " + text); Qt.exit(1); }

    function stateNames(s) {
        var out = [];
        for (var i = 0; i < s.states.length; i++) out.push(s.states[i].name);
        return out;
    }

    Component.onCompleted: {
        Fixture.load(args[1]);
        var sc = Qt.createComponent(Qt.resolvedUrl(args[0]));
        if (sc.status === Component.Error) return fail(sc.errorString());
        scene = sc.createObject(sceneLayer, { "width": win.width, "height": win.height });
        if (!scene) return fail(args[0] + ": could not be created");
        if (args[2] === "--states") {
            var f = scene.frame;
            console.log("SHOT-INFO " + JSON.stringify({ "states": stateNames(scene),
                "frame": f ? { "x": f.x, "y": f.y, "width": f.width, "height": f.height } : null }));
            Qt.quit();
            return;
        }

        var wanted = args[3] || "";
        if (wanted) {
            if (stateNames(scene).indexOf(wanted) < 0) return fail(args[0] + ": no state " + wanted + " (has " + stateNames(scene).join(", ") + ")");
            scene.state = wanted;
        }

        var list = scene.parts !== undefined ? scene.parts : scene.part !== undefined ? [{ "part": scene.part, "lg": scene.lg }] : [];
        for (var i = 0; i < list.length; i++) {
            var c = Qt.createComponent(Qt.resolvedUrl("../ui/Look/parts/" + list[i].part));
            if (c.status === Component.Error) return fail(c.errorString());
            var part = c.createObject(stage);
            if (!part) return fail(list[i].part + ": could not be created");
            var lg = list[i].lg || null;
            if (part.claims !== undefined) {
                if (!lg) return fail(list[i].part + " claims an LG item, but the scene gives it none");
                if (!part.claims(lg)) return fail(list[i].part + " does not claim the scene's lg: the mock no longer looks like LG's item");
            }
            part.lg = lg;
            placed.push(part);
        }
        ready.start();
    }

    // The style's font loads asynchronously; a shot taken before it would show the system font.
    readonly property bool fontWanted: { var s = Fixture.payload.style; return !!(s && s.font && s.font.files && s.font.files.length && Fixture.payload.fonts); }
    Timer {
        id: ready
        interval: 50
        repeat: true
        onTriggered: if (!win.fontWanted || Look.font !== "") { stop(); shoot.start(); }
    }
    // A scene that throws never reaches the shot; give up rather than hang.
    Timer { interval: 15000; running: true; onTriggered: win.fail("no shot after 15 s" + (win.fontWanted && Look.font === "" ? " (the style's font never loaded)" : "")) }
    Timer {
        id: shoot
        interval: 700
        onTriggered: win.contentItem.grabToImage(function (r) { r.saveToFile(win.args[2]); Qt.quit(); })
    }
}
