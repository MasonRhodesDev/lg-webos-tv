pragma Singleton
import QtQuick 2.4

// The TV's settings services as the preview answers them (SETTINGS-PLAN.md section 4): a US TV (an OLED55B9) watching
// HDMI 2 at 4K 120 Hz in Filmmaker mode, sound on the TV speakers, on a cable with the internet blocked, LG's data
// agreements withdrawn (the boards' TV). Scenes and tests change `values`, `desc` and `fail` before or while they run.
// Addresses are from the documentation ranges (RFC 5737).
QtObject {
    id: fixture

    property var values: ({
        "picture": { "pictureMode": "expert1", "backlight": 50, "contrast": 85, "brightness": 50, "colorTemperature": 50,
                     "truMotionMode": "off", "energySaving": "off", "eyeComfortMode": "off" },
        "aspectRatio": { "arcPerApp": "16x9" },
        "sound": { "soundMode": "standard", "soundOutput": "tv_speaker", "soundOutputDigital": "auto", "audioBalance": 0,
                   "autoVolume": "off", "avSync": "off", "audioDescription": "off" },
        "dimensionInfo": { "input": "hdmi2", "dynamicRange": "sdr", "_3dStatus": "2d" },
        "caption": { "captionEnable": "off" },
        "option": { "highContrast": "off", "quickStartMode": "off", "country": "USA", "audioGuidance": "on" },
        "other": { "simplinkEnable": "on", "simplinkAutoPowerOn": "on" },
        "general": { "screenSaverEnabled": "on" },
        "support": { "automaticUpdate": "off" },
        "": { "localeInfo": { "locales": { "UI": "en-US", "TV": "en-US", "FMT": "en-US", "NLP": "en-US" } },
              "eulaStatus": { "generalTermsAllowed": true, "networkAllowed": true, "acrOnAllowed": false, "acrAdAllowed": false,
                              "customAdAllowed": false, "additionalDataAllowed": false, "voiceAllowed": false, "voice2Allowed": false,
                              "takeOnAllowed": false, "chpAllowed": false } }
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
        "returnValue": true, "isInternetConnectionAvailable": false,
        "wired": { "state": "connected", "ipAddress": "192.0.2.24", "gateway": "192.0.2.1", "onInternet": "no" },
        "wifi": { "state": "disconnected" }
    })
    // tv.display getHDMIInfo: the current HDMI input's signal.
    property var hdmi: ({ "returnValue": true, "HDMImode": true, "width": 3840, "height": 2160, "frameRate": 120, "scanType": true })
    // tv.systemproperty getSystemInfo and systemservice osInfo/query.
    property var system: ({ "modelName": "OLED55B9PUA", "firmwareVersion": "05.40.45", "core_os_release": "4.10.0" })
    // systemservice getPreferences.
    property var preferences: ({ "useNetworkTime": false, "timeZone": "America/New_York" })
    // Keys ("category.key", "sleepTimer", "volume") whose next write fails, to show the rollback.
    property var fail: ({})
    // Keys whose writes are never answered (a call the bus drops), to show the timeout rollback.
    property var silent: ({})
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
            if (s.kind === "signal" && key === "signal") answer(s.svc, "/getHDMIInfo", hdmi);
            if (s.kind === "prefs" && key === "prefs") answer(s.svc, "/getPreferences", { "returnValue": true, "useNetworkTime": preferences.useNetworkTime });
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
             "com.webos.service.tv.display", "com.webos.service.tvpower", "com.webos.applicationManager",
             "com.webos.service.tv.systemproperty", "com.palm.systemservice"].indexOf(service) < 0) return false;
        calls.push({ "uri": uri, "method": method, "params": p });
        var key;
        if (service === "com.webos.settingsservice") {
            if (method === "/getSystemSettings") {
                if (p.subscribe) subs.push({ "svc": svc, "kind": "settings", "category": p.category, "keys": p.keys });
                answer(svc, method, settingsOf(p.category, p.keys));
            } else if (method === "/getSystemSettingDesc") {
                answer(svc, method, descOf(p.category, p.keys));
            } else if (method === "/setSystemSettings") {
                for (key in p.settings) if (silent[p.category + "." + key]) return true;
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
                if (silent.volume) return true;
                if (fail.volume) { delete fail.volume; answer(svc, method, { "returnValue": false, "errorText": "Not allowed now" }); return true; }
                volume = p.volume;
                answer(svc, method, { "returnValue": true });
                notify("", "volume");
            } else {
                if (p.subscribe) subs.push({ "svc": svc, "kind": "volume" });
                answer(svc, method, { "returnValue": true, "volume": volume });
            }
        } else if (service === "com.webos.service.tv.display" && method === "/getHDMIInfo") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "signal" });
            answer(svc, method, hdmi);
        } else if (service === "com.webos.service.tv.systemproperty" && method === "/getSystemInfo") {
            var info = { "returnValue": true };
            for (var i = 0; i < p.keys.length; i++) if (system[p.keys[i]] !== undefined) info[p.keys[i]] = system[p.keys[i]];
            answer(svc, method, info);
        } else if (service === "com.palm.systemservice" && method === "/osInfo/query") {
            answer(svc, method, { "returnValue": true, "core_os_release": system.core_os_release });
        } else if (service === "com.palm.systemservice" && method === "/getPreferences") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "prefs" });
            answer(svc, method, { "returnValue": true, "useNetworkTime": preferences.useNetworkTime });
        } else if (service === "com.palm.systemservice" && method === "/setPreferences") {
            for (key in p) preferences[key] = p[key];
            answer(svc, method, { "returnValue": true });
            notify("", "prefs");
        } else {
            answer(svc, method, { "returnValue": true });
        }
        return true;
    }
}
