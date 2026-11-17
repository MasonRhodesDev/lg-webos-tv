var themepackHomeApp = "dev.themepack.home";
var themepackLongPress = 1000;
var themepackPressedAt = 0;

function init() {
}

function themepackHomeRefused() {
    if (modalAlert.visible) return "a modal alert is up";
    if (!access.ribbon) return "the ribbon is off";
    if (!overlayView.access.ribbon) return "an overlay turned the ribbon off";
    if (settingsService.disableHome) return "Home is disabled";
    if (bootManager.bootFirstUse && !systemPropertyService.powerOnlyMode) return "first-use setup";
    if (homeView.visible) return "LG's Home is showing";
    return "";
}

function themepackLgHome() {
    var other = settingsService.getLaunchDefaultApp;
    try { global.prepareToGoHome(); } catch (e) { }
    if (other) { applicationManager.launch(other, JSON.stringify({ "launchType": "homeKey" })); return; }
    applicationManager.launchDefaultApp("com.webos.app.home", JSON.stringify({ "category": "home" }));
}

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
        if (!took) return KeyPolicy.NextPolicy;
        themepackPressedAt = 0;
        if (new Date().getTime() - took >= themepackLongPress) themepackLgHome();
        else themepackOurHome();
        return KeyPolicy.Accepted;
    } catch (e) {
        themepackPressedAt = 0;
        if (took && !pressed) {
            try { themepackLgHome(); } catch (e2) { }
            return KeyPolicy.Accepted;
        }
        return KeyPolicy.NextPolicy;
    }
}
