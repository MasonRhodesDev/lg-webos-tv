.pragma library
// How an input looks wherever our layer draws one (the input picker, the Home dock): its icon and its hue. `e` is an
// input as LG names it: { id, appId, inputType }. Each HDMI input keeps its own hue across every surface.

function iconFor(e) {
    if (e.id === "titleItem") return "home";
    if (e.inputType === "usb") return "usb";
    if (e.inputType === "dlna") return "cast";
    if (String(e.appId).indexOf("livetv") >= 0) return "screen";
    if (String(e.appId).indexOf("hdmi") >= 0 || String(e.appId).indexOf("av") >= 0) return "port";
    return "grid";
}

function hueFor(e) {
    var m = /hdmi(\d+)/.exec(String(e.appId));
    if (m) return (parseInt(m[1], 10) - 1) % 4;
    if (e.id === "titleItem") return 6;
    if (e.inputType === "usb") return 5;
    if (e.inputType === "dlna") return 3;
    return 4;
}
