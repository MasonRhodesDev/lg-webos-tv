pragma Singleton
import QtQuick 2.4
import QtQml 2.2
import WebOSServices 1.0

// Look: the active style's tokens and the active themes, for our own UI layer. Until the Look service answers,
// tokens fall back to LG-like stock values, so the layer looks plain rather than broken.
QtObject {
    id: look

    readonly property string service: "luna://dev.themepack.look.service"
    property var tokens: ({})
    property var themes: []
    property string assets: ""
    property string styleId: ""
    // The active style's font family, for `font.family`. Empty (the system font) until its files have loaded; on a
    // style change it keeps the previous family until the new one is ready, so text never flashes to the system font.
    property string font: ""
    property var fontSpec: ({ "family": "", "files": [] })
    property string fontsDir: ""
    // The chosen look as the service holds it: { style, themes: [ids] }.
    property var chosen: ({ "style": "", "themes": [] })
    property var behaviour: ({})
    // What can be chosen: { styles: [{id, name}], themes: [{id, name, description}] }.
    property var available: ({ "styles": [], "themes": [] })
    property bool online: false

    readonly property var stock: ({
        "surface": "rgba(18,18,18,0.92)", "surface-edge": "rgba(255,255,255,0.12)", "ink": "#f5f5f5",
        "ink-disabled": "rgba(255,255,255,0.45)", "track": "rgba(110,110,110,0.35)", "focus": "#cf0652",
        "focus-ink": "#ffffff", "knob": "#f5f5f5", "r-panel": "0px"
    })

    function token(name) { return tokens[name] !== undefined ? tokens[name] : stock[name]; }

    // Tokens are CSS colours; QML colour properties do not parse rgba().
    function colorOf(css) {
        if (css === undefined) return "transparent";
        var m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(css);
        if (m) return Qt.rgba(m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : Number(m[4]));
        return css;
    }
    function color(name) { return colorOf(token(name)); }
    function px(name) { return parseFloat(token(name)) || 0; }
    // A recipe's fill is a colour or a token name.
    function fill(value) { return /^(#|rgb)/.test(value) ? colorOf(value) : color(value); }

    // The rings one slot draws for a component type, in paint order. Themes listed later wrap further out: their back
    // rings paint first and their front rings paint last. Recipes this renderer cannot draw (HTML-only) are left out.
    function rings(target, slot) {
        var list = slot === "back" ? themes.slice().reverse() : themes, out = [];
        for (var i = 0; i < list.length; i++) {
            var recipes = list[i].recipes || [];
            for (var j = 0; j < recipes.length; j++) {
                var r = recipes[j];
                if (r.slot !== slot || (r.target !== "*" && r.target !== target)) continue;
                if (!r.asset && !r.fill) continue;
                out.push({ theme: list[i].id, recipe: r });
            }
        }
        return out;
    }

    function apply(m) {
        tokens = m.style.tokens;
        themes = m.themes || [];
        assets = m.assets || "";
        styleId = m.look.style;
        chosen = m.look;
        behaviour = m.style.behaviour || {};
        available = m.available || { "styles": [], "themes": [] };
        if (m.picker) {
            // The first answer of each subscription only records where requests stand.
            if (pickerAt >= 0 && m.picker.at !== pickerAt) pickerRequested(m.picker.open);
            pickerAt = m.picker.at;
        }
        var f = m.style.font || {};
        if (f.family === fontSpec.family && (m.fonts || "") === fontsDir) return;
        fontsDir = m.fonts || "";
        if (f.family && !(fontsDir && f.files && f.files.length)) report("gap", "style " + styleId + ": no font files, using the system font");
        fontSpec = { "family": f.family || "", "files": fontsDir ? f.files || [] : [] };
    }

    function fontStatusChanged() {
        var files = fontSpec.files, ready = 0;
        if (fontLoaders.count !== files.length) return;
        for (var i = 0; i < files.length; i++) {
            var l = fontLoaders.objectAt(i);
            if (!l || l.status === FontLoader.Loading) return;
            if (l.status === FontLoader.Error) report("error", "font " + l.source + " did not load");
            else if (l.status === FontLoader.Ready) ready++;
        }
        if (!ready || font === fontSpec.family) return;
        font = fontSpec.family;
        report("ok", "font " + font + ": " + ready + " of " + files.length + " files loaded");
    }

    // One loader per file: each file is one weight, and all of them register under the style's family name.
    property var fontLoaders: Instantiator {
        model: look.fontSpec.files
        onObjectAdded: look.fontStatusChanged()
        delegate: FontLoader {
            source: look.fontsDir + modelData
            onStatusChanged: look.fontStatusChanged()
        }
    }

    // Someone asked for our Look picker to open or close (the Look app's launch, or luna-send).
    signal pickerRequested(bool open)
    property real pickerAt: -1

    // Changes go out on their own bus object; their result comes back through the subscription.
    function setLook(change) { command.call(service, "/setLook", JSON.stringify(change)); }
    function closePicker() { command.call(service, "/closePicker", "{}"); }
    property var command: Service { appId: "com.webos.surfacemanager.systemui" }

    function report(kind, text) {
        bus.call(service, "/report", JSON.stringify({ "from": "ui", "kind": kind, "text": text }));
    }

    property var bus: Service {
        appId: "com.webos.surfacemanager.systemui"
        onResponse: {
            try {
                var m = JSON.parse(payload);
                if (m.returnValue && m.style && m.style.tokens) look.apply(m);
            } catch (e) {
                console.warn("Look: unreadable response: " + e);
            }
        }
    }

    // Each time the service appears on the bus, subscribe once, fresh: a subscription ends when the service restarts.
    property var status: Service {
        appId: "com.webos.surfacemanager.systemui"
        onResponse: {
            try {
                var m = JSON.parse(payload);
                if (m.serviceName !== "dev.themepack.look.service") return;
                look.online = m.connected;
                if (m.connected) {
                    look.pickerAt = -1;
                    look.bus.call(look.service, "/getLook", JSON.stringify({ "subscribe": true }));
                }
            } catch (e) {
                console.warn("Look: unreadable bus status: " + e);
            }
        }
        Component.onCompleted: call("palm://com.palm.bus", "/signal/registerServerStatus",
                                    JSON.stringify({ "serviceName": "dev.themepack.look.service", "subscribe": true }))
    }

    // The service starts on demand. While it is away, a plain call starts it; the status above then subscribes.
    property var wake: Timer {
        interval: 5000
        repeat: true
        triggeredOnStart: true
        running: !look.online
        onTriggered: look.bus.call(look.service, "/getLook", "{}")
    }
}
