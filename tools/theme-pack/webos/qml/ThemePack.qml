pragma Singleton
import QtQuick 2.4
import WebOSServices 1.0

// ThemePack: the active style's tokens for the compositor's QML. Every property starts at LG's stock value, so the
// UI looks stock until the Look service answers, and stays stock if it never does. Bindings to these properties
// update live when the look changes.
QtObject {
    id: tp

    property bool ready: false
    property string styleId: ""
    property var themes: []

    property color focus: "#cf0652"
    property color focusInk: "#ffffff"
    property color ink: "#f5f5f5"
    property color panel: "#121212"
    property color tile: "#222222"
    property color tileActive: "#8f8f8f"
    property color current: "#cf0652"
    property string trackRgb: "110,110,110"
    property real trackOpacity: 0.35

    // Tokens arrive as CSS colours; QML colour properties do not parse rgba().
    function toColor(css, fallback) {
        if (!css) return fallback;
        var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(css);
        if (m) return Qt.rgba(m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : Number(m[4]));
        return css;
    }

    function apply(msg) {
        var t = msg.style.tokens;
        focus = toColor(t["focus"], focus);
        focusInk = toColor(t["focus-ink"], focusInk);
        ink = toColor(t["ink"], ink);
        panel = toColor(t["surface"], panel);
        tile = toColor(t["inner"], tile);
        tileActive = toColor(t["surface-edge"], tileActive);
        current = toColor(t["current"], current);
        var tr = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(t["track"] || "");
        if (tr) {
            trackRgb = tr[1] + "," + tr[2] + "," + tr[3];
            trackOpacity = tr[4] === undefined ? 1 : Number(tr[4]);
        }
        styleId = msg.look.style;
        themes = msg.look.themes;
        ready = true;
    }

    property var service: Service {
        // A compositor bus name whose private role allows outbound calls to any service.
        appId: "com.webos.surfacemanager.systemui"
        onResponse: {
            try {
                var m = JSON.parse(payload);
                if (m.returnValue && m.style && m.style.tokens) tp.apply(m);
            } catch (e) {
                console.warn("ThemePack: unreadable Look response: " + e);
            }
        }
    }

    function subscribe() {
        service.call("luna://dev.themepack.look.service", "/getLook", JSON.stringify({ "subscribe": true }));
    }

    // A cold service drops the call that starts it, so keep asking until the first answer.
    property var retry: Timer {
        interval: 5000
        repeat: true
        running: !tp.ready
        onTriggered: tp.subscribe()
    }

    Component.onCompleted: subscribe()
}
