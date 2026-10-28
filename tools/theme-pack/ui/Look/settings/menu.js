.pragma library
// Our Settings' information architecture (the owner's Settings boards): the categories down the left, and the pages
// we design by hand. Every other page of LG's catalog (catalog.js) is reachable too, drawn from its items as they
// are, so the whole tree can be walked while the next pages are designed.
//
// A page is { id, category, title, sub, rows }. `sub` is text, or { from: <item ref or [refs]>, format } for those
// items' value labels, joined with " · ".
// A row is one of:
//   { item: ref, label, icon }       a setting. Its catalog type picks the row: switch → toggle (or `as: "value"`: its
//                                    value and a picker of its two values), enum → value (OK opens a picker page),
//                                    range → slider (or `as: "value"`: OK opens an adjust page), info → info.
//                                    `as: "toggle", on, off` shows an enum as a switch of two values. `sub` is the
//                                    subtitle of the picker it opens.
//   { page: id, label, icon, value } a link to another page; `value` (an item ref) shows that setting's value.
//   { action: ref, label, icon }     an action item (catalog type "action"); `confirm` asks first (a Dialog); `drill`
//                                    shows a chevron (it opens something of its own).
//   { missing: "why", label, icon }  a board row with nothing behind it on this TV, greyed with the reason; `as` picks
//                                    the control it is drawn with.
//   { section: "Title" }             a section header.
//   { more: "<catalog category>" }   links to that catalog category's pages that no designed page links to.
// `hint` is a caption line (`hintWhen`: only while a store condition is known to hold); `why` is the caption when the
// TV greys the row (its description says inactive), and `activeWhen` greys it by a rule of ours (a store condition,
// see Store.holds); `then` on an enum row adds a link at the foot of its picker ({ page, label } with %s for the
// chosen value's label). Item refs are catalog item ids (or "Page/id"), or ids in `extra` below.
// Lists and forms:
//   { list: ref }                    a live list from the store (wifiNetworks, btDevices): a row per network or device,
//                                    in sections; OK asks what to do with it (join, forget, pair, ...) in a Dialog.
//   { text: ref, label, icon }       a line of text (`texts` below): OK opens the keyboard (TextPrompt), Done writes it.
//   { changePin: true, label, icon } choose a new PIN, twice, on the PIN prompt.
//   `pin: true` on a row asks for the PIN first (PinPrompt), once per visit to Settings.
//   `confirmOff` on a toggle asks before turning it off.

var categories = [
    { id: "picture", label: "Picture", icon: "screen", page: "Picture" },
    { id: "sound", label: "Sound", icon: "speaker", page: "Sound" },
    { id: "connection", label: "Connection", icon: "wifi", page: "Network" },
    { id: "general", label: "General", icon: "grid", page: "General" },
    { id: "accessibility", label: "Accessibility", icon: "person", page: "Accessibility" },
    { id: "support", label: "Support", icon: "help", page: "Support" }
];

// Which of our categories holds each catalog category's pages.
var home = { picture: "picture", sound: "sound", network: "connection", general: "general", channels: "general",
             safety: "general", accessibility: "accessibility" };

var pages = {
    "Picture": { category: "picture", title: "Picture", sub: { from: "input", format: "Applies to %s" }, rows: [
        { item: "pictureMode", label: "Picture mode", icon: "screen", sub: { from: ["input", "signal"] },
          then: { page: "PictureMode", label: "Adjust %s", icon: "sliders" } },
        { item: "backlight", label: "Brightness", icon: "sun" },
        { item: "contrast", label: "Contrast", icon: "half" },
        { item: "colorTemperature", label: "Colour temperature", icon: "thermo", as: "value" },
        { item: "truMotionMode", label: "Motion smoothing", icon: "motion", why: "Locked off in Filmmaker mode" },
        { item: "energySaving", label: "Energy saving", icon: "leaf", as: "toggle", on: "auto", off: "off" },
        { page: "OledPanelSettings", label: "Pixel refresher", icon: "refresh" },
        { more: "picture" }
    ] },
    "Sound": { category: "sound", title: "Sound", sub: { from: "soundOutput" }, rows: [
        { item: "soundMode", label: "Sound mode", icon: "speaker" },
        { item: "soundOutput", label: "Sound out", icon: "out" },
        { item: "audioBalance", label: "Balance", icon: "balance" },
        { item: "avSync", label: "AV sync adjustment", icon: "clock", as: "value" },
        { item: "soundOutputDigital", label: "Digital sound output", icon: "plug" },
        { item: "autoVolume", label: "Auto volume", icon: "sliders" },
        { page: "Bluetooth", label: "Bluetooth surround", icon: "bt", value: "btSoundOut",
          activeWhen: { ref: "btPairedCount", not: [0] }, why: "Pair a Bluetooth speaker first" },
        { more: "sound" }
    ] },
    "Network": { category: "connection", title: "Connection", sub: { from: "internet" }, rows: [
        { page: "Wired", label: "Wired connection", icon: "plug", value: "wiredStatus" },
        { page: "Wifi", label: "Wi-Fi", icon: "wifi", value: "wifiSummary" },
        { item: "networkStatus", label: "Internet", icon: "globe" },
        { page: "Bluetooth", label: "Bluetooth devices", icon: "bt", value: "btPairedCount" },
        { item: "simplinkEnable", label: "HDMI device control", hint: "Turn connected devices on and off with the TV", icon: "link" },
        { page: "ScreenShare", label: "Screen Share", icon: "cast" },
        { action: "deviceConnector", label: "Device connector", icon: "grid", drill: true },
        { more: "network" }
    ] },
    // Look is ours, and the boards have no place for it: General is where the catalog's unplaced pages go (`home`),
    // so it follows the board's seven rows there.
    "General": { category: "general", title: "General", sub: { from: "tvVersion" }, rows: [
        { page: "Language", label: "Language", icon: "lang", value: "menuLanguage" },
        { page: "TimeDate", label: "Time and date", icon: "clock", value: "autoTime" },
        { page: "HomeSettings", label: "Home dashboard", icon: "home" },
        { item: "quickStartMode", label: "Quick Start+", hint: "Faster power-on, uses more standby power", icon: "bolt" },
        { item: "screenSaverEnabled", label: "Screen saver", icon: "power", as: "value" },
        { action: "resetToInitial", label: "Reset to initial settings", icon: "reset", drill: true },
        { page: "AboutThisTV", label: "About this TV", icon: "info", value: "modelName" },
        { page: "Look", label: "Look", icon: "palette", value: "look.style" },
        { more: "general" },
        { more: "channels" },
        { more: "safety" }
    ] },
    "Accessibility": { category: "accessibility", title: "Accessibility", sub: "Also on the remote: hold Mute", rows: [
        { item: "highContrast", label: "High contrast", icon: "contrast" },
        { missing: "Not on this TV's software", label: "Greyscale", icon: "eye", as: "toggle" },
        { missing: "Not on this TV's software", label: "Invert colours", icon: "invert", as: "toggle" },
        { item: "AudioGuidance/audioGuidance", label: "Audio guidance", hint: "Reads menus aloud", icon: "ear" },
        { page: "ClosedCaption", label: "Subtitles", icon: "cc", value: "captionEnable" },
        { item: "audioDescription", label: "Audio description", icon: "speaker" },
        { missing: "Not on this TV's software", label: "Text size", icon: "lang", as: "value" },
        { more: "accessibility" }
    ] },
    "Support": { category: "support", title: "Support", sub: { from: "onlineHelp" }, rows: [
        { page: "SoftwareUpdate", label: "Software update", icon: "update", value: "updates",
          hintWhen: { ref: "internet", is: ["Offline"] }, hint: "Updates are blocked while the TV stays offline" },
        { action: "pictureTest", label: "Picture test", icon: "screen", drill: true },
        { action: "soundTest", label: "Sound test", icon: "speaker", drill: true },
        { page: "SignalTest", label: "Signal test", icon: "test" },
        { page: "AboutThisTV", label: "TV information", icon: "info", value: "tvSummary" },
        { page: "LegalNotice", label: "Privacy and terms", icon: "shield", value: "agreements" }
    ] },
    "SoftwareUpdate": { category: "support", title: "Software update", sub: { from: "tvVersion" }, rows: [
        { item: "firmwareVersion", label: "Software version", icon: "info" },
        { item: "automaticUpdate", label: "Automatic updates", hint: "An update can remove root access", icon: "update" }
    ] },
    // The current input's signal, as LG's Settings shows it in its HDMI diagnostics (getHDMIInfo).
    "SignalTest": { category: "support", title: "Signal test", sub: { from: "input" }, rows: [
        { item: "signalMode", label: "HDMI mode", icon: "port" },
        { item: "signalResolution", label: "Resolution", icon: "screen" },
        { item: "signalRate", label: "Frame rate", icon: "motion" },
        { item: "signalScan", label: "Scan type", icon: "sliders" }
    ] },
    "Timers": { category: "general", title: "Timers", rows: [
        { item: "sleepTimer", label: "Sleep timer", icon: "moon" },
        { page: "TimerPowerOn", label: "Power on timer", icon: "power" },
        { page: "TimerPowerOff", label: "Power off timer", icon: "power" }
    ] },
    "Look": { category: "general", title: "Look", sub: "One style, any themes", rows: [] },
    // Lists, forms and the PIN (page ids `wifi`, `bluetooth`, `pin`, `keyboard-input`; see `aliases`).
    "Wifi": { category: "connection", title: "Wi-Fi", sub: { from: "wifiSummary" }, rows: [
        { item: "wifiEnabled", label: "Wi-Fi", icon: "wifi", confirmOff: "Turn off Wi-Fi? Apps that need the internet go offline." },
        { list: "wifiNetworks" },
        { section: "More" },
        { page: "WifiAdd", label: "Add a hidden network", icon: "plus" },
        { page: "WifiAdvanced", label: "IP and DNS", icon: "sliders" }
    ] },
    "Bluetooth": { category: "connection", title: "Bluetooth devices", sub: "Speakers and headphones", rows: [
        { list: "btDevices" },
        { section: "More" },
        { page: "EasyPairing", label: "LG speaker quick pairing", icon: "speaker" }
    ] },
    "Safety": { category: "general", title: "Safety", sub: "Locks need the PIN", rows: [
        { item: "parentalControl", label: "Locks", hint: "Ask for the PIN before locked programmes, apps and inputs", icon: "lock", pin: true },
        { page: "RatingLocks", label: "Rating locks", icon: "shield", pin: true },
        { page: "ApplicationLocks", label: "App locks", icon: "grid", pin: true },
        { page: "InputLocks", label: "Input locks", icon: "port", pin: true },
        { changePin: true, label: "Change PIN", icon: "lock", pin: true }
    ] },
    "InputLocks": { category: "general", title: "Input locks", rows: [
        { item: "inputBlock", label: "Locked inputs", icon: "port",
          missing: "Not built yet: a bit per input in LG's lockable-input list, whose service is unchecked" }
    ] },
    "ApplicationLocks": { category: "general", title: "App locks", rows: [
        { item: "appLocks", label: "Locked apps", icon: "grid",
          missing: "Not built yet: LG's app-lock call is unchecked on the TV" }
    ] },
    "KeyboardInput": { category: "general", title: "Keyboard and text", rows: [
        { text: "Network/deviceName", label: "TV name", hint: "Shown to phones and casting apps", icon: "cast" },
        { item: "keyboardLanguages", label: "Keyboard languages", icon: "lang",
          missing: "Not built yet: it rewrites the TV's whole locale, unchecked on the TV" },
        { page: "WirelessKeyboard", label: "LG wireless keyboard", icon: "keyboard" }
    ] }
};

// The page ids other pages and the content lane link to, for the pages above that stand in for LG's.
var aliases = { "wifi": "Wifi", "bluetooth": "Bluetooth", "pin": "Safety", "keyboard-input": "KeyboardInput" };

// Lines of text the keyboard edits, by item id: their limits and the keys they open on. A ZIP is 5 digits (LG's rule
// for the USA); a TV name is 1 to 32 characters (ours: LG's limit is not in its Settings).
var texts = {
    "deviceName": { min: 1, max: 32 },
    "zipcode": { min: 5, max: 5, layout: "symbols" }
};

// Settings that are not in LG's catalog: the volume, screen off, the input picker, our own Look, and what the TV
// reports about itself. `from` makes an item a view of another one's value, with labels of its own.
var extra = {
    "volume": { id: "volume", tier: 1, type: "range", domain: { min: 0, max: 100, step: 1 },
                api: { service: "com.webos.audio", read: "getVolume", subscribe: true, write: "setVolume", param: "volume" } },
    "screenOff": { id: "screenOff", tier: 1, type: "action",
                   api: { service: "com.webos.service.tvpower", method: "power/turnOffScreen" } },
    "inputPicker": { id: "inputPicker", tier: 1, type: "action", api: { systemui: "com.webos.app.quickinputpicker" } },
    "input": { id: "input", tier: 3, type: "info",
               api: { service: "com.webos.settingsservice", read: "getSystemSettings", category: "dimensionInfo", keys: ["input"] } },
    // The current input's signal, as LG's Settings reads it for its HDMI diagnostics: { width, height, frameRate,
    // scanType }. Only an HDMI input has one.
    "signal": { id: "signal", tier: 3, type: "info", api: { service: "com.webos.service.tv.display", read: "getHDMIInfo", subscribe: true } },
    "signalMode": { id: "signalMode", tier: 3, type: "info", from: "signal" },
    "signalResolution": { id: "signalResolution", tier: 3, type: "info", from: "signal" },
    "signalRate": { id: "signalRate", tier: 3, type: "info", from: "signal" },
    "signalScan": { id: "signalScan", tier: 3, type: "info", from: "signal" },
    "wiredStatus": { id: "wiredStatus", tier: 2, type: "info", api: { service: "com.webos.service.connectionmanager", field: "wired" } },
    "wifiStatus": { id: "wifiStatus", tier: 2, type: "info", api: { service: "com.webos.service.connectionmanager", field: "wifi" } },
    "internet": { id: "internet", tier: 2, type: "info", api: { service: "com.webos.service.connectionmanager", field: "isInternetConnectionAvailable" } },
    "onlineHelp": { id: "onlineHelp", tier: 3, type: "info", from: "internet" },
    // The model and versions, read once (tv.systemproperty getSystemInfo, systemservice osInfo/query).
    "modelName": { id: "modelName", tier: 3, type: "info", api: { service: "com.webos.service.tv.systemproperty", read: "getSystemInfo", keys: ["modelName"] } },
    "firmwareVersion": { id: "firmwareVersion", tier: 3, type: "info", api: { service: "com.webos.service.tv.systemproperty", read: "getSystemInfo", keys: ["firmwareVersion"] } },
    "tvVersion": { id: "tvVersion", tier: 3, type: "info", api: { service: "com.palm.systemservice/osInfo", read: "query", parameters: ["core_os_release"] } },
    "tvSummary": { id: "tvSummary", tier: 3, type: "info", api: { service: "com.webos.service.tv.systemproperty", read: "getSystemInfo" } },
    // LG's data agreements. tools/telemetry-off withdraws the data ones each boot (its EULA_KEYS, below).
    "eulaStatus": { id: "eulaStatus", tier: 3, type: "info",
                    api: { service: "com.webos.settingsservice", read: "getSystemSettings", category: "", keys: ["eulaStatus"] } },
    "telemetry": { id: "telemetry", tier: 3, type: "info", from: "eulaStatus" },
    // Whether tools/telemetry-off is in force this boot, as the Look service sees it (service.js getTelemetry).
    "telemetryKit": { id: "telemetryKit", tier: 3, type: "info", api: { service: "dev.themepack.look.service", read: "getTelemetry" } },
    "agreements": { id: "agreements", tier: 3, type: "info", from: "eulaStatus" },
    "btSoundOut": { id: "btSoundOut", tier: 3, type: "info", from: "soundOutput" },
    "updates": { id: "updates", tier: 3, type: "info", from: "automaticUpdate" },
    "look.style": { id: "look.style", tier: 1, type: "enum", api: { look: "style" } },
    // Connection's Wi-Fi value: Off, or the network it is on (Store.state).
    "wifiSummary": { id: "wifiSummary", tier: 2, type: "info", api: { service: "com.webos.service.wifi", read: "getstatus" } },
    // How many Bluetooth audio devices are paired (the Connection board's "1 paired"; 0 greys Bluetooth surround).
    "btPairedCount": { id: "btPairedCount", tier: 2, type: "info", api: { service: "com.webos.service.btaudiosrc", read: "getPairedDevices" } }
};

// The agreements tools/telemetry-off withdraws (its EULA_KEYS): all false means LG's data collection is refused.
var dataAgreements = ["acrOnAllowed", "acrAdAllowed", "customAdAllowed", "additionalDataAllowed", "voiceAllowed",
                      "voice2Allowed", "takeOnAllowed", "chpAllowed"];

// An eulaStatus reply: "accepted" when any data agreement reads as accepted (true, or "true" as some replies type
// it), "withdrawn" only when every one is there and false, "" when the reply cannot say (missing keys, other types).
function agreementState(v) {
    if (!v || typeof v !== "object") return "";
    var unsure = false, i, x;
    for (i = 0; i < dataAgreements.length; i++) {
        x = v[dataAgreements[i]];
        if (x === true || x === "true") return "accepted";
    }
    for (i = 0; i < dataAgreements.length; i++) if (v[dataAgreements[i]] !== false) unsure = true;
    return unsure ? "" : "withdrawn";
}

// The footer's second clause. "telemetry off" needs the telemetry-off kit in force this boot (the Look service's
// getTelemetry: "active") and no data agreement accepted; without the kit, the agreements say only what they prove.
function telemetryLabel(kit, eula) {
    var a = agreementState(eula);
    if (a === "accepted") return "telemetry on";
    if (kit === "active") return "telemetry off";
    return a === "withdrawn" ? "agreements withdrawn" : "";
}

// The quick sheet (the gear button): the board's rows, in its order.
var quick = { title: "Quick settings", sub: { from: ["input", "signal"] }, rows: [
    { item: "pictureMode", label: "Picture mode", icon: "screen" },
    { item: "soundOutput", label: "Sound out", icon: "speaker" },
    { item: "volume", label: "Volume", icon: "volume" },
    { item: "sleepTimer", label: "Sleep timer", icon: "moon" },
    { item: "energySaving", label: "Energy saving", icon: "leaf", as: "toggle", on: "auto", off: "off" },
    { action: "screenOff", label: "Screen off", icon: "screenOff" },
    { settings: true, label: "All settings", icon: "sliders" }
] };

// LG's Quick Settings launch params: the hotkeys land on their row with its picker open.
var activateTypes = { "picture-mode": "pictureMode", "sleep": "sleepTimer", "aspect-ratio": "AspectRatioSettings" };

// A caption under a value in its picker, by item id and value.
var hints = {
    pictureMode: { game: "Lowest input lag", hdrGame: "Lowest input lag", dolbyHdrGame: "Lowest input lag" }
};

// Value labels, by item id. Anything missing is shown from its value ("hdrCinema" → "Hdr cinema").
var labels = {
    pictureMode: { vivid: "Vivid", normal: "Standard", eco: "Eco", cinema: "Cinema", sports: "Sports", game: "Game",
                   photo: "Photo", expert1: "Filmmaker", expert2: "Expert (dark room)", technicolor: "Technicolor",
                   hdrVivid: "Vivid", hdrStandard: "Standard", hdrCinema: "Cinema", hdrCinemaBright: "Cinema home",
                   hdrGame: "Game", hdrEffect: "HDR effect", hdrTechnicolor: "Technicolor",
                   dolbyHdrVivid: "Vivid", dolbyHdrStandard: "Standard", dolbyHdrCinema: "Cinema",
                   dolbyHdrCinemaBright: "Cinema home", dolbyHdrGame: "Game" },
    soundMode: { standard: "Standard", movie: "Cinema", news: "Clear voice", sports: "Sports", music: "Music", game: "Game",
                 aiSound: "AI sound" },
    soundOutput: { tv_speaker: "TV speakers", external_arc: "HDMI ARC", external_optical: "Optical", bt_soundbar: "Bluetooth",
                   wisa_speaker: "WiSA speakers", lineout: "Line out", headphone: "Headphones", bt_audio: "Bluetooth",
                   tv_speakerbar: "TV speakers and soundbar", builtin_soundbar: "Built-in soundbar",
                   tv_external_speaker: "TV speakers and optical", tv_speaker_headphone: "TV speakers and headphones",
                   tv_speakerbar_headphone: "Soundbar and headphones" },
    soundOutputDigital: { pcm: "PCM", auto: "Auto", passThrough: "Pass through" },
    sleepTimer: { off: "Off", "10": "10 min", "20": "20 min", "30": "30 min", "60": "1 hr", "90": "1 hr 30 min",
                  "120": "2 hr", "180": "3 hr", "240": "4 hr" },
    wifiEnabled: { enabled: "On", disabled: "Off" },
    energySaving: { auto: "Auto", off: "Off", min: "Minimum", med: "Medium", max: "Maximum", screen_off: "Screen off" },
    truMotionMode: { off: "Off", smooth: "Smooth", clear: "Clear", user: "Custom" },
    avSync: { on: "On", off: "Off" },
    autoTime: { on: "Automatic", off: "Manual" },
    btSoundOut: { bt_soundbar: "On", bt_audio: "On" },
    updates: { on: "Automatic", off: "Paused" },
    telemetryKit: { active: "", inactive: "", unknown: "" },
    onlineHelp: { Offline: "Offline: online help is unavailable", Online: "" },
    input: { hdmi1: "HDMI 1", hdmi2: "HDMI 2", hdmi3: "HDMI 3", hdmi4: "HDMI 4", atv: "Antenna", dtv: "Live TV",
             av1: "AV", comp1: "Component", default: "Apps" }
};

// A signal (getHDMIInfo) as the boards write it: "4K · 120 Hz".
function signalLabel(v) {
    if (!v || !v.height) return "";
    var h = v.height, res = h >= 4320 ? "8K" : h >= 2160 ? "4K" : h + (v.scanType === false || v.scanType === 0 ? "i" : "p");
    return v.frameRate ? res + " \u00b7 " + Math.round(v.frameRate) + " Hz" : res;
}

// Range values that read better as words.
function rangeLabel(id, v) {
    if (id === "colorTemperature") return v === 0 ? "Neutral" : (v > 0 ? "Warm " : "Cool ") + Math.abs(v);
    if (id === "btPairedCount") return v ? v + " paired" : "None paired";
    // Short: a slider's number has room for three characters.
    if (id === "audioBalance") return v === 0 ? "0" : (v < 0 ? "L " : "R ") + Math.abs(v);
    return String(v);
}

// An id as words: "eyeComfortMode" → "Eye comfort mode".
function words(id) {
    var s = String(id).replace(/^_/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Menu languages by the UI locale's language (in English: the styles' fonts are Latin only).
var languages = { en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
                  nl: "Dutch", ko: "Korean", ja: "Japanese", zh: "Chinese" };

// Values that are objects, or that read as another word.
function derived(id, v) {
    if (id === "menuLanguage") {
        var ui = v && v.locales && v.locales.UI ? String(v.locales.UI) : "";
        return languages[ui.split("-")[0]] || ui;
    }
    if (id === "telemetry") return telemetryLabel(undefined, v);
    if (id === "agreements") { var a = agreementState(v); return a === "withdrawn" ? "Agreements withdrawn" : a === "accepted" ? "Accepted" : ""; }
    if (id === "signalMode") return v.HDMImode === undefined ? "" : v.HDMImode ? "HDMI" : "DVI";
    if (id === "signalResolution") return v.width && v.height ? v.width + " \u00d7 " + v.height : "";
    if (id === "signalRate") return v.frameRate ? (Math.round(v.frameRate * 100) / 100) + " Hz" : "";
    if (id === "signalScan") return v.scanType === undefined ? "" : v.scanType ? "Progressive" : "Interlaced";
    if (id === "btSoundOut") return labels.btSoundOut[v] || "Off";
    return undefined;
}

function valueLabel(id, v) {
    if (v === undefined || v === null || v === "") return "";
    var d = derived(id, v);
    if (d !== undefined) return d;
    var t = labels[id];
    if (t && t[String(v)] !== undefined) return t[String(v)];
    if (typeof v === "number") return rangeLabel(id, v);
    if (v === "on") return "On";
    if (v === "off") return "Off";
    return words(v);
}
