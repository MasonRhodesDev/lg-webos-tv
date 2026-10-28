.pragma library
// Our Settings' information architecture (the owner's Settings boards): the categories down the left, and the pages
// we design by hand. Every other page of LG's catalog (catalog.js) is reachable too, drawn from its items as they
// are, so the whole tree can be walked while the next pages are designed.
//
// A page is { id, category, title, sub, rows }. `sub` is text, or { from: <item ref> } for that item's value label.
// A row is one of:
//   { item: ref, label, icon }       a setting. Its catalog type picks the row: switch → toggle, enum → value (OK
//                                    opens a picker page), range → slider (or `as: "value"`: OK opens an adjust page),
//                                    info → info. `as: "toggle", on, off` shows an enum as a switch of two values.
//   { page: id, label, icon, value } a link to another page; `value` (an item ref) shows that setting's value.
//   { action: ref, label, icon }     an action item (catalog type "action"); `confirm` asks first (a Dialog).
//   { section: "Title" }             a section header.
//   { more: "<catalog category>" }   links to that catalog category's pages that no designed page links to.
// `hint` is a caption line; `why` is the caption when the TV greys the row (its description says inactive), and
// `activeWhen` greys it by a rule of ours (a store condition, see Store.holds); `then` on an enum row adds a link at the foot of its picker
// ({ page, label } with %s for the chosen value's label). Item refs are catalog item ids (or "Page/id"), or ids in
// `extra` below.

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
        { item: "pictureMode", label: "Picture mode", icon: "screen",
          then: { page: "PictureMode", label: "Adjust %s", icon: "sliders" } },
        { item: "backlight", label: "Brightness", icon: "sun" },
        { item: "contrast", label: "Contrast", icon: "half" },
        { item: "colorTemperature", label: "Colour temperature", icon: "thermo", as: "value" },
        { item: "truMotionMode", label: "Motion smoothing", icon: "motion", why: "Locked off in Filmmaker mode" },
        { item: "energySaving", label: "Energy saving", icon: "leaf", as: "toggle", on: "auto", off: "off" },
        { page: "OledPanelSettings", label: "Pixel refresher", icon: "refresh" },
        { page: "AspectRatioSettings", label: "Aspect ratio", icon: "aspect" },
        { more: "picture" }
    ] },
    "Sound": { category: "sound", title: "Sound", sub: { from: "soundOutput" }, rows: [
        { item: "soundMode", label: "Sound mode", icon: "speaker" },
        { item: "soundOutput", label: "Sound out", icon: "out" },
        { item: "audioBalance", label: "Balance", icon: "balance" },
        { page: "SoundOut", label: "AV sync adjustment", icon: "clock" },
        { item: "soundOutputDigital", label: "Digital sound output", icon: "plug" },
        { item: "autoVolume", label: "Auto volume", icon: "sliders" },
        { page: "Bluetooth", label: "Bluetooth devices", icon: "bt" },
        { more: "sound" }
    ] },
    "Network": { category: "connection", title: "Connection", sub: { from: "networkStatus" }, rows: [
        { page: "Wired", label: "Wired connection", icon: "plug", value: "wiredStatus" },
        { page: "Wifi", label: "Wi-Fi", icon: "wifi", value: "wifiStatus" },
        { item: "networkStatus", label: "Internet", icon: "globe" },
        { page: "Bluetooth", label: "Bluetooth devices", icon: "bt" },
        { item: "simplinkEnable", label: "HDMI device control", hint: "Turn connected devices on and off with the TV", icon: "link" },
        { action: "inputPicker", label: "Switch input", icon: "port" },
        { more: "network" }
    ] },
    "General": { category: "general", title: "General", rows: [
        { page: "Language", label: "Language", icon: "lang" },
        { page: "TimeDate", label: "Time and date", icon: "clock" },
        { page: "Timers", label: "Timers", icon: "moon", value: "sleepTimer" },
        { item: "quickStartMode", label: "Quick Start+", hint: "Faster power-on, uses more standby power", icon: "bolt" },
        { page: "Look", label: "Look", icon: "palette", value: "look.style" },
        { page: "AboutThisTV", label: "About this TV", icon: "info" },
        { more: "general" },
        { more: "channels" },
        { more: "safety" }
    ] },
    "Accessibility": { category: "accessibility", title: "Accessibility", rows: [
        { item: "highContrast", label: "High contrast", icon: "contrast" },
        { page: "AudioGuidance", label: "Audio guidance", hint: "Reads menus aloud", icon: "ear" },
        { item: "captionEnable", label: "Subtitles", icon: "cc" },
        { more: "accessibility" }
    ] },
    "Support": { category: "support", title: "Support", rows: [
        { page: "AboutThisTV", label: "TV information", icon: "info" },
        { action: "pictureTest", label: "Picture test", icon: "screen" }
    ] },
    "Timers": { category: "general", title: "Timers", rows: [
        { item: "sleepTimer", label: "Sleep timer", icon: "moon" },
        { page: "TimerPowerOn", label: "Power on timer", icon: "power" },
        { page: "TimerPowerOff", label: "Power off timer", icon: "power" }
    ] },
    "Look": { category: "general", title: "Look", sub: "One style, any themes", rows: [] }
};

// Settings that are not in LG's catalog: the volume, screen off, the input picker, our own Look.
var extra = {
    "volume": { id: "volume", tier: 1, type: "range", domain: { min: 0, max: 100, step: 1 },
                api: { service: "com.webos.audio", read: "getVolume", subscribe: true, write: "setVolume", param: "volume" } },
    "screenOff": { id: "screenOff", tier: 1, type: "action",
                   api: { service: "com.webos.service.tvpower", method: "power/turnOffScreen" } },
    "inputPicker": { id: "inputPicker", tier: 1, type: "action", api: { systemui: "com.webos.app.quickinputpicker" } },
    "input": { id: "input", tier: 3, type: "info",
               api: { service: "com.webos.settingsservice", read: "getSystemSettings", category: "dimensionInfo", keys: ["input"] } },
    "wiredStatus": { id: "wiredStatus", tier: 2, type: "info", api: { service: "com.webos.service.connectionmanager", field: "wired" } },
    "wifiStatus": { id: "wifiStatus", tier: 2, type: "info", api: { service: "com.webos.service.connectionmanager", field: "wifi" } },
    "look.style": { id: "look.style", tier: 1, type: "enum", api: { look: "style" } }
};

// The quick sheet (the gear button): the board's rows, in its order.
var quick = { title: "Quick settings", sub: { from: "input" }, rows: [
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
    energySaving: { auto: "Auto", off: "Off", min: "Minimum", med: "Medium", max: "Maximum", screen_off: "Screen off" },
    truMotionMode: { off: "Off", smooth: "Smooth", clear: "Clear", user: "Custom" },
    input: { hdmi1: "HDMI 1", hdmi2: "HDMI 2", hdmi3: "HDMI 3", hdmi4: "HDMI 4", atv: "Antenna", dtv: "Live TV",
             av1: "AV", comp1: "Component", default: "Apps" }
};

// Range values that read better as words.
function rangeLabel(id, v) {
    if (id === "colorTemperature") return v === 0 ? "Neutral" : (v > 0 ? "Warm " : "Cool ") + Math.abs(v);
    if (id === "audioBalance") return v === 0 ? "Centre" : (v < 0 ? "Left " : "Right ") + Math.abs(v);
    return String(v);
}

// An id as words: "eyeComfortMode" → "Eye comfort mode".
function words(id) {
    var s = String(id).replace(/^_/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function valueLabel(id, v) {
    if (v === undefined || v === null || v === "") return "";
    var t = labels[id];
    if (t && t[String(v)] !== undefined) return t[String(v)];
    if (typeof v === "number") return rangeLabel(id, v);
    if (v === "on") return "On";
    if (v === "off") return "Off";
    return words(v);
}
