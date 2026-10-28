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

    // Every token, so the kit is whole before the service answers: LG-like dark grey and magenta, Smoke's metrics.
    readonly property var stock: ({
        "surface": "rgba(18,18,18,0.92)", "surface-edge": "rgba(255,255,255,0.12)", "inner": "rgba(255,255,255,0.07)",
        "dim": "rgba(0,0,0,0.55)", "scrim": "rgba(0,0,0,0.35)", "ink": "#f5f5f5", "ink-2": "rgba(255,255,255,0.86)",
        "ink-3": "rgba(255,255,255,0.66)", "ink-disabled": "rgba(255,255,255,0.40)", "edge-disabled": "rgba(255,255,255,0.30)", "shadow": "0 2px 8px rgba(0,0,0,0.5)",
        "focus": "#cf0652", "focus-ink": "#ffffff", "focus-edge": "#ffffff", "current": "#cf0652",
        "attention": "#cf0652", "attention-ink": "#ffffff", "critical": "#e04848", "critical-ink": "#ffffff",
        "track": "rgba(110,110,110,0.35)", "knob": "#ffffff",
        "hue-0": "#f5f5f5", "hue-1": "#f5f5f5", "hue-2": "#f5f5f5", "hue-3": "#f5f5f5", "hue-4": "#f5f5f5",
        "hue-5": "#f5f5f5", "hue-6": "#f5f5f5",
        "r-tile": "12px", "r-panel": "12px", "r-row": "8px", "r-key": "8px",
        "surface-strong": "rgba(18,18,18,0.96)", "divider": "rgba(255,255,255,0.10)", "current-ink": "#ffffff", "r-control": "999px",
        "safe-x": "96px", "safe-y": "54px", "space-xs": "8px", "space-s": "12px", "space-m": "20px", "space-ml": "24px", "space-l": "28px", "space-lx": "32px",
        "space-xl": "40px", "space-xxl": "56px", "edge-w": "1px", "focus-w": "3px", "focus-scale": "1", "current-w": "6px",
        "panel-w": "640px", "dialog-w": "800px", "toast-w": "720px", "row-h": "88px", "row-h-2": "104px", "row-pad": "28px",
        "section-h": "60px", "icon": "34px", "icon-l": "44px", "well": "72px", "volume-w": "480px", "volume-h": "88px", "track-h": "12px", "thumb": "30px", "toggle-w": "72px",
        "toggle-h": "40px", "knob-size": "32px", "button-h": "80px", "tile-w": "260px", "tile-h": "190px", "tile-pad": "24px",
        "elev-panel": "0 20px 50px rgba(0,0,0,0.5)", "elev-focus": "0 10px 26px rgba(0,0,0,0.45)",
        "type-display": "64px", "type-display-weight": "700", "type-title": "40px", "type-title-weight": "700",
        "type-tile": "30px", "type-tile-weight": "700", "type-label": "26px", "type-label-weight": "600", "type-category": "28px", "type-category-weight": "600",
        "type-value": "24px", "type-value-weight": "400", "type-body": "28px", "type-body-weight": "400",
        "type-caption": "20px", "type-caption-weight": "400", "type-headline": "32px", "type-headline-weight": "700", "type-heading": "19px", "type-heading-weight": "600",
        "type-heading-case": "uppercase", "type-key": "18px", "type-key-weight": "600", "type-numeral": "40px",
        "type-numeral-weight": "600", "motion-focus": "120ms", "motion-value": "200ms", "motion-enter": "300ms",
        "motion-exit": "200ms", "ease-focus": "cubic-bezier(0.2,0,0,1)", "ease-enter": "cubic-bezier(0.05,0.7,0.1,1)",
        "ease-exit": "cubic-bezier(0.3,0,0.8,0.15)", "enter-shift": "40px",
        "key-w": "132px", "key-h": "80px", "key-gap": "14px", "field-h": "96px", "active-w": "3px", "pin-w": "720px",
        "pad-w": "432px", "pad-key-h": "88px", "slot-w": "96px", "slot-h": "112px", "slot-dot": "28px",
        "type-entry": "40px", "type-entry-weight": "600", "type-cap": "32px", "type-cap-weight": "600",
        "type-cap-word": "24px", "type-cap-word-weight": "600", "type-pad": "30px", "type-pad-weight": "700",
        "type-prompt": "22px", "type-prompt-weight": "600"
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
    // A type role's weight token ("400".."800") as Qt's weight; styles only name weights their font files carry.
    function weight(role) {
        var w = parseFloat(token(role + "-weight")) || 400;
        return w >= 800 ? Font.ExtraBold : w >= 700 ? Font.Bold : w >= 600 ? Font.DemiBold : w >= 500 ? Font.Medium : Font.Normal;
    }
    // A CSS box-shadow token ("x y blur [spread] colour") as { x, y, blur, color }.
    function shadow(name) {
        var m = /^\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?(?:\s+-?[\d.]+(?:px)?)?\s+(.+)$/.exec(token(name) || "");
        return m ? { "x": Number(m[1]), "y": Number(m[2]), "blur": Number(m[3]), "color": colorOf(m[4]) }
                 : { "x": 0, "y": 0, "blur": 0, "color": "transparent" };
    }
    // A CSS cubic-bezier() token as an easing.bezierCurve (Easing.Bezier).
    function curve(name) {
        var m = /cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/.exec(token(name) || "");
        return m ? [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), 1, 1] : [0.25, 0.1, 0.25, 1, 1, 1];
    }
    function hue(i) { return color("hue-" + ((i || 0) % 7)); }
    // What a focused item fills with: the focus colour, or under a style whose behaviour says so, the item's hue.
    function focusFill(hueIndex) { return behaviour.focusFill === "hue" && hueIndex >= 0 ? hue(hueIndex) : color("focus"); }

    // A recipe's fill or stroke is a colour or a token name.
    function fill(value) { return /^(#|rgb)/.test(value) ? colorOf(value) : color(value); }

    // The rings one slot draws for a component type, in paint order. Themes listed later wrap further out: their back
    // rings paint first and their front rings paint last. A recipe with no asset, fill or stroke is left out.
    function rings(target, slot) {
        var list = slot === "back" ? themes.slice().reverse() : themes, out = [];
        for (var i = 0; i < list.length; i++) {
            var recipes = list[i].recipes || [];
            for (var j = 0; j < recipes.length; j++) {
                var r = recipes[j];
                if (r.slot !== slot || (r.target !== "*" && r.target !== target)) continue;
                if (!r.asset && !r.fill && !r.stroke) continue;
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
        if (m.settings) {
            // The first answer of each subscription only records where requests stand. Only opens are requests:
            // closeSettings comes from the layer itself.
            if (settingsAt >= 0 && m.settings.at !== settingsAt && m.settings.open) settingsRequested(m.settings.target || "");
            settingsAt = m.settings.at;
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

    // Someone asked for our Settings at a page (a catalog page id, or "" for the top): the Settings stub, the Look app,
    // or luna-send.
    signal settingsRequested(string target)
    property real settingsAt: -1

    // Changes go out on their own bus object; their result comes back through the subscription.
    function setLook(change) { command.call(service, "/setLook", JSON.stringify(change)); }
    function closeSettings() { command.call(service, "/closeSettings", "{}"); }
    property var command: Service { appId: "com.webos.surfacemanager.systemui" }

    function report(kind, text) {
        bus.call(service, "/report", JSON.stringify({ "from": "ui", "kind": kind, "text": text }));
    }
    function probe(from, state) {
        bus.call(service, "/setProbe", JSON.stringify({ "from": from, "state": state }));
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
                    look.settingsAt = -1;
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
