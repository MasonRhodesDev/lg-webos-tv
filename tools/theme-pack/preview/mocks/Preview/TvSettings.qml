pragma Singleton
import QtQuick 2.4

// The TV's settings services as the preview answers them (SETTINGS-PLAN.md section 4): a US TV watching HDMI 2 in
// Filmmaker mode, sound on the TV speakers, online over Wi-Fi. Scenes and tests change `values`, `desc` and `fail`
// before or while they run. Addresses are from the documentation ranges (RFC 5737).
QtObject {
    id: fixture

    property var values: ({
        "picture": { "pictureMode": "expert1", "backlight": 50, "contrast": 85, "brightness": 50, "colorTemperature": 50,
                     "truMotionMode": "off", "energySaving": "off", "eyeComfortMode": "off" },
        "aspectRatio": { "arcPerApp": "16x9" },
        "sound": { "soundMode": "standard", "soundOutput": "tv_speaker", "soundOutputDigital": "auto", "audioBalance": 0,
                   "autoVolume": "off", "avSync": "off" },
        "dimensionInfo": { "input": "hdmi2", "dynamicRange": "sdr", "_3dStatus": "2d" },
        "caption": { "captionEnable": "off" },
        "option": { "highContrast": "off", "quickStartMode": "off", "country": "USA", "audioGuidance": "on" },
        "other": { "simplinkEnable": "on", "simplinkAutoPowerOn": "on" }
    })
    // Description overrides by "category.key": { visible, active, values: [visible values] }. Anything else is
    // described from the catalog's domain, every value visible and active.
    property var desc: ({
        "picture.pictureMode": { "values": ["vivid", "normal", "cinema", "sports", "game", "expert1"] },
        "picture.truMotionMode": { "active": false },
        "sound.soundOutput": { "values": ["tv_speaker", "external_arc", "external_optical", "bt_soundbar"] },
        "sound.soundMode": { "values": ["standard", "movie", "news", "music", "sports", "game"] }
    })
    property var domains: ({})
    property int sleepMinutes: 0
    property int volume: 21
    property var network: ({
        "returnValue": true, "isInternetConnectionAvailable": true,
        "wired": { "state": "disconnected" },
        "wifi": { "state": "connected", "ssid": "Home", "ipAddress": "192.0.2.24", "gateway": "192.0.2.1", "onInternet": "yes" }
    })
    // Keys ("category.key", "sleepTimer", "volume") whose next write fails, to show the rollback.
    property var fail: ({})
    // Every call made, for tests: [{ uri, method, params }].
    property var calls: []
    property var subs: []

    function setDomain(key, values) { domains[key] = values; }

    function answer(svc, method, obj) { svc.response(method, JSON.stringify(obj)); }

    function settingsOf(category, keys) {
        var out = {}, cat = values[category] || {};
        for (var i = 0; i < keys.length; i++) if (cat[keys[i]] !== undefined) out[keys[i]] = cat[keys[i]];
        return { "returnValue": true, "category": category, "settings": out };
    }
    function descOf(category, keys) {
        var results = [];
        for (var i = 0; i < keys.length; i++) {
            var k = category + "." + keys[i], o = desc[k] || {}, vals = o.values || domains[k], r = { "key": keys[i],
                "ui": { "visible": o.visible !== false, "active": o.active !== false } };
            if (vals) {
                var ext = [];
                for (var j = 0; j < vals.length; j++) ext.push({ "value": vals[j], "visible": true, "active": (o.inactive || []).indexOf(vals[j]) < 0 });
                r.values = { "arrayExt": ext };
            }
            results.push(r);
        }
        return { "returnValue": true, "results": results };
    }

    function notify(category, key) {
        for (var i = 0; i < subs.length; i++) {
            var s = subs[i];
            if (s.cancelled) continue;
            if (s.kind === "settings" && s.category === category && s.keys.indexOf(key) >= 0) answer(s.svc, "/getSystemSettings", settingsOf(category, s.keys));
            if (s.kind === "volume" && key === "volume") answer(s.svc, "/getVolume", { "returnValue": true, "volume": volume });
        }
    }
    function cancel(svc) {
        for (var i = 0; i < subs.length; i++) if (subs[i].svc === svc) subs[i].cancelled = true;
    }

    // Returns false for calls that are not the settings services'.
    function handle(svc, uri, method, params) {
        var p = params ? JSON.parse(params) : {};
        var service = uri.replace(/^(luna|palm):\/\//, "");
        if (["com.webos.settingsservice", "com.webos.service.tv.time", "com.webos.service.connectionmanager", "com.webos.audio",
             "com.webos.service.tv.display", "com.webos.service.tvpower", "com.webos.applicationManager"].indexOf(service) < 0) return false;
        calls.push({ "uri": uri, "method": method, "params": p });
        var key;
        if (service === "com.webos.settingsservice") {
            if (method === "/getSystemSettings") {
                if (p.subscribe) subs.push({ "svc": svc, "kind": "settings", "category": p.category, "keys": p.keys });
                answer(svc, method, settingsOf(p.category, p.keys));
            } else if (method === "/getSystemSettingDesc") {
                answer(svc, method, descOf(p.category, p.keys));
            } else if (method === "/setSystemSettings") {
                for (key in p.settings) {
                    if (fail[p.category + "." + key]) { delete fail[p.category + "." + key]; answer(svc, method, { "returnValue": false, "errorText": "Not allowed now" }); return true; }
                }
                answer(svc, method, { "returnValue": true });
                for (key in p.settings) {
                    if (!values[p.category]) values[p.category] = {};
                    values[p.category][key] = p.settings[key];
                    notify(p.category, key);
                }
            } else {
                answer(svc, method, { "returnValue": true });
            }
        } else if (service === "com.webos.service.tv.time") {
            if (method === "/setSleepTimeInfo") {
                if (fail.sleepTimer) { delete fail.sleepTimer; answer(svc, method, { "returnValue": false, "errorText": "Not allowed now" }); return true; }
                sleepMinutes = p.sleepTimeMinute;
                answer(svc, method, { "returnValue": true });
            } else {
                answer(svc, method, { "returnValue": true, "sleepTimeMinute": sleepMinutes, "sleepTimeSecond": sleepMinutes * 60 });
            }
        } else if (service === "com.webos.service.connectionmanager") {
            answer(svc, method, network);
        } else if (service === "com.webos.audio") {
            if (method === "/setVolume") {
                if (fail.volume) { delete fail.volume; answer(svc, method, { "returnValue": false, "errorText": "Not allowed now" }); return true; }
                volume = p.volume;
                answer(svc, method, { "returnValue": true });
                notify("", "volume");
            } else {
                if (p.subscribe) subs.push({ "svc": svc, "kind": "volume" });
                answer(svc, method, { "returnValue": true, "volume": volume });
            }
        } else {
            answer(svc, method, { "returnValue": true });
        }
        return true;
    }
}
