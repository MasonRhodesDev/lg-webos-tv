// The Home key, for our Home dock. A key filter script: the layer puts it in LG's key filter chain (in memory, just
// ahead of LG's own Home handling) while the dock is listening, and takes it out again when the layer retires.
//
// It runs in the key filter's scope, on Qt 5.6's ES5 engine: no let, const, arrow functions or template strings, and
// no QML. LG's helpers it uses are globals there: KeyPolicy, Qt, lunaCall, applicationManager, global, modalAlert,
// access, overlayView, homeView, settingsService, bootManager, systemPropertyService. Our own names start with
// `themepack` so they never shadow one of LG's.
//
// A short press of Home opens our dock: it asks LG's system UI manager for our overlay entry (dev.themepack.home),
// which tells the layer. Held about a second, or whenever anything here fails, Home opens LG's Home instead. Every
// other key, and Home whenever LG itself would not open Home, goes on to the next filter untouched.

var themepackHomeApp = "dev.themepack.home";
var themepackLongPress = 1000;
// When the Home press we took went down (ms since the epoch); 0 while we hold no press.
var themepackPressedAt = 0;

// It does not report what it does: reports sent from the key filter's bus connection never reached the Look service. The dock's part
// reports each request it gets ("home: requested").
function init() {
}

// LG's own conditions for ignoring Home (a modal alert, the ribbon turned off, Home disabled, first-use setup), and
// LG's Home already showing. Returns which one holds, or "" when Home is ours. In each case the key goes on to LG,
// which decides as it always has.
function themepackHomeRefused() {
    if (modalAlert.visible) return "a modal alert is up";
    if (!access.ribbon) return "the ribbon is off";
    if (!overlayView.access.ribbon) return "an overlay turned the ribbon off";
    if (settingsService.disableHome) return "Home is disabled";
    if (bootManager.bootFirstUse && !systemPropertyService.powerOnlyMode) return "first-use setup";
    if (homeView.visible) return "LG's Home is showing";
    return "";
}

// LG's Home, as a short press opens it when no filter of ours is in the chain: the settings may name another default
// app, which is launched as from the Home key; otherwise LG's Home app opens on its home category.
function themepackLgHome() {
    var other = settingsService.getLaunchDefaultApp;
    try { global.prepareToGoHome(); } catch (e) { }
    if (other) { applicationManager.launch(other, JSON.stringify({ "launchType": "homeKey" })); return; }
    applicationManager.launchDefaultApp("com.webos.app.home", JSON.stringify({ "category": "home" }));
}

// The system UI manager's answer to our launch. Anything but returnValue: true opens LG's Home.
function themepackLaunched(payload) {
    try {
        var reply = JSON.parse(payload);
        if (!reply || reply.returnValue !== true) themepackLgHome();
    } catch (e) {
        try { themepackLgHome(); } catch (e2) { }
    }
}

function themepackOurHome() {
    lunaCall.send("com.webos.service.systemUIManager", "/launch", JSON.stringify({ "appId": themepackHomeApp }), themepackLaunched);
}

function themepackHandleHome(key, pressed, autoRepeat) {
    var took = themepackPressedAt;
    try {
        if (key !== Qt.Key_Super_L) return KeyPolicy.NextPolicy;
        if (pressed) {
            if (autoRepeat) return took ? KeyPolicy.Accepted : KeyPolicy.NextPolicy;
            themepackPressedAt = 0;
            var refused = themepackHomeRefused();
            if (refused) return KeyPolicy.NextPolicy;
            themepackPressedAt = new Date().getTime() || 1;
            return KeyPolicy.Accepted;
        }
        // A release: ours only if we took its press.
        if (!took) return KeyPolicy.NextPolicy;
        themepackPressedAt = 0;
        if (new Date().getTime() - took >= themepackLongPress) themepackLgHome();
        else themepackOurHome();
        return KeyPolicy.Accepted;
    } catch (e) {
        // A press goes on to LG with nothing of ours pending. The release of a press we took would reach LG without
        // its press, and LG would do nothing: open LG's Home from here instead.
        themepackPressedAt = 0;
        if (took && !pressed) {
            try { themepackLgHome(); } catch (e2) { }
            return KeyPolicy.Accepted;
        }
        return KeyPolicy.NextPolicy;
    }
}
