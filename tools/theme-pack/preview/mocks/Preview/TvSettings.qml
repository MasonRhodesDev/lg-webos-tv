pragma Singleton
import QtQuick 2.4

// The TV's settings services as the preview answers them (SETTINGS-PLAN.md section 4): a US TV (an OLED55B9) watching
// HDMI 2 at 4K 120 Hz in Filmmaker mode, sound on the TV speakers, on a cable with the internet blocked, LG's data
// agreements withdrawn, tools/telemetry-off in force, Wi-Fi off, one soundbar paired, the PIN 0000 (the boards'
// TV). Scenes and tests change `values`, `desc` and
// `fail` (or `silent`) before or while they run. Addresses are from the documentation ranges (RFC 5737, and RFC 7042
// for the Bluetooth MACs). Picture's range values are strings, as the real settingsservice answers them; Sound's
// balance stays a number, and the volume (com.webos.audio) is one, to keep both cases covered.
QtObject {
    id: fixture

    property var values: ({
        "picture": { "pictureMode": "expert1", "backlight": "50", "contrast": "85", "brightness": "50", "colorTemperature": "50",
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
                              "takeOnAllowed": false, "chpAllowed": false } },
        "lock": { "parentalControl": false, "systemPin": "0000" },
        "network": { "deviceName": "Living room TV" }
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
    // The Look service's getTelemetry: tools/telemetry-off in force this boot.
    property string telemetryKit: "active"
    // systemservice getPreferences.
    property var preferences: ({ "useNetworkTime": false, "timeZone": "America/New_York" })
    // Wi-Fi as com.webos.service.wifi answers it (off, as on the boards; its networks show once a scene turns it on). `password` is what each secured network takes.
    property string wifiState: "serviceDisabled"
    property var networks: [
        { "ssid": "Home", "signalBars": 4, "availableSecurityTypes": ["psk"], "profileId": 1, "connectState": "ipConfigured", "password": "tea4two@" },
        { "ssid": "Upstairs", "signalBars": 2, "availableSecurityTypes": ["psk"], "profileId": 2, "password": "stairs99" },
        { "ssid": "Cafe Corner", "signalBars": 3, "availableSecurityTypes": ["none"] },
        { "ssid": "Neighbour 5G", "signalBars": 1, "availableSecurityTypes": ["psk"], "password": "nextdoor" },
        { "ssid": "Garage", "signalBars": 2, "availableSecurityTypes": ["psk"], "password": "wrench12" }
    ]
    property int nextProfile: 3
    // Bluetooth as the real TV answers com.webos.service.bluetooth2/device/getStatus: paired devices with their class
    // (major class 4 is audio), the magic remote among them (BLE, "LGE MR19"). Connected means connectedProfiles is
    // not empty. Actions go to com.webos.service.btaudiosrc, as LG's Settings sends them; `nearby` is what its search
    // finds.
    property var btDevices: [
        { "address": "00:00:5E:00:53:01", "name": "Living room soundbar", "paired": true, "typeOfDevice": "bredr",
          "classOfDevice": 2360320, "connectedProfiles": ["a2dp"], "trusted": false, "blocked": false, "rssi": 0 },
        { "address": "00:00:5E:00:53:0A", "name": "LGE MR19", "paired": true, "typeOfDevice": "ble", "classOfDevice": 7936,
          "connectedProfiles": ["hid"], "trusted": true, "blocked": false, "rssi": 0 }
    ]
    function btPair(name, address, connected) {
        btDevices.push({ "address": address, "name": name, "paired": true, "typeOfDevice": "bredr", "classOfDevice": 2360320,
                         "connectedProfiles": connected ? ["a2dp"] : [], "trusted": false, "blocked": false, "rssi": 0 });
    }
    property var btNearby: [{ "address": "00:00:5E:00:53:03", "name": "Headphones", "type": "headset" }]
    // Keys ("category.key", "sleepTimer", "volume", "wifi.connect", "wifi.forget", "wifi.state", "bt.connect",
    // "bt.disconnect", "bt.forget", "bt.search") whose next write fails, to show the rollback.
    property var fail: ({})
    // Keys whose writes are never answered (a call the bus drops), to show the timeout rollback.
    property var silent: ({})
    // Every call made, for tests: [{ uri, method, params }]. Toasts (com.webos.notification/createToast) are in it too.
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
            if (s.kind === "wifi" && key === "wifi") answer(s.svc, "/getstatus", { "returnValue": true, "status": wifiState });
            if (s.kind === "networks" && key === "wifi") answer(s.svc, "/findnetworks", foundNetworks());
            if (s.kind === "bt" && key === "bt") answer(s.svc, "/device/getStatus", btStatus());
        }
    }
    function cancel(svc) {
        for (var i = 0; i < subs.length; i++) if (subs[i].svc === svc) subs[i].cancelled = true;
    }

    function foundNetworks() {
        var out = [];
        if (wifiState === "serviceDisabled") return { "returnValue": true, "foundNetworks": [] };
        for (var i = 0; i < networks.length; i++) {
            var n = networks[i], info = { "ssid": n.ssid, "displayName": n.ssid, "signalBars": n.signalBars,
                "availableSecurityTypes": n.availableSecurityTypes, "supported": true, "connectState": n.connectState || "notAssociated" };
            if (n.profileId !== undefined) info.profileId = n.profileId;
            out.push({ "networkInfo": info });
        }
        return { "returnValue": true, "foundNetworks": out };
    }
    function netNamed(ssid, profileId) {
        for (var i = 0; i < networks.length; i++) if (networks[i].ssid === ssid || (profileId !== undefined && networks[i].profileId === profileId)) return networks[i];
        return null;
    }
    function failing(key, svc, method, text, code) {
        if (silent[key]) return true;
        if (!fail[key]) return false;
        delete fail[key];
        answer(svc, method, { "returnValue": false, "errorCode": code || -1, "errorText": text || "Not allowed now" });
        return true;
    }
    function device(address) {
        for (var i = 0; i < btDevices.length; i++) if (btDevices[i].address === address) return btDevices[i];
        return null;
    }
    function btStatus() { return { "returnValue": true, "adapterAddress": "00:00:5E:00:53:FF", "devices": btDevices }; }
    function handleWifi(svc, method, p) {
        if (method === "/getstatus") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "wifi" });
            answer(svc, method, { "returnValue": true, "status": wifiState });
        } else if (method === "/findnetworks") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "networks" });
            answer(svc, method, foundNetworks());
        } else if (method === "/setstate") {
            if (failing("wifi.state", svc, method)) return;
            wifiState = p.state === "disabled" ? "serviceDisabled" : "serviceEnabled";
            answer(svc, method, { "returnValue": true });
            notify("", "wifi");
        } else if (method === "/connect") {
            if (failing("wifi.connect", svc, method, "Could not establish a connection", 13)) return;
            var n = netNamed(p.ssid, p.profileId);
            if (!n) { answer(svc, method, { "returnValue": false, "errorCode": 102 }); return; }
            var key = p.security && p.security.simpleSecurity ? p.security.simpleSecurity.passKey : undefined;
            if (n.password && n.profileId === undefined && key !== n.password) { answer(svc, method, { "returnValue": false, "errorCode": 10 }); return; }
            for (var i = 0; i < networks.length; i++) networks[i].connectState = "notAssociated";
            n.connectState = "ipConfigured";
            if (n.profileId === undefined) n.profileId = nextProfile++;
            answer(svc, method, { "returnValue": true, "profileId": n.profileId });
            notify("", "wifi");
        } else if (method === "/deleteprofile") {
            if (failing("wifi.forget", svc, method)) return;
            var f = netNamed("", p.profileId);
            if (f) { delete f.profileId; f.connectState = "notAssociated"; }
            answer(svc, method, { "returnValue": true });
            notify("", "wifi");
        } else {
            answer(svc, method, { "returnValue": true });
        }
    }
    function handleBt2(svc, method, p) {
        if (method === "/device/getStatus") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "bt" });
            answer(svc, method, btStatus());
        } else if (method === "/adapter/getStatus") {
            answer(svc, method, { "returnValue": true, "adapters": [{ "powered": true, "name": "TV", "discovering": false }] });
        } else {
            answer(svc, method, { "returnValue": false, "errorText": "not mocked" });
        }
    }
    function handleBt(svc, method, p) {
        var i, d;
        if (method === "/getPairedDevices") {
            // The real TV leaves this unanswered; nothing of ours may need it.
            return;
        } else if (method === "/startDiscovery") {
            if (failing("bt.search", svc, method)) return;
            answer(svc, method, { "returnValue": true, "timeOut": 60 });
            for (i = 0; i < btNearby.length; i++) if (!device(btNearby[i].address)) answer(svc, method, { "returnValue": true, "state": "started", "device": btNearby[i] });
        } else if (method === "/connect") {
            if (failing("bt.connect", svc, method, "Pairing failed")) return;
            d = device(p.address);
            if (!d) {
                for (i = 0; i < btNearby.length; i++) if (btNearby[i].address === p.address) d = btNearby[i];
                if (!d) { answer(svc, method, { "returnValue": false, "errorText": "No such device" }); return; }
                btPair(d.name, d.address, false);
                d = device(p.address);
            }
            for (i = 0; i < btDevices.length; i++) if (btDevices[i].classOfDevice === 2360320) btDevices[i].connectedProfiles = [];
            d.connectedProfiles = ["a2dp"];
            answer(svc, method, { "returnValue": true });
            notify("", "bt");
        } else if (method === "/disconnect") {
            if (failing("bt.disconnect", svc, method)) return;
            d = device(p.address);
            if (d) d.connectedProfiles = [];
            answer(svc, method, { "returnValue": true });
            notify("", "bt");
        } else if (method === "/removePairedDevice") {
            if (failing("bt.forget", svc, method)) return;
            for (i = 0; i < btDevices.length; i++) if (btDevices[i].address === p.address) btDevices.splice(i, 1);
            answer(svc, method, { "returnValue": true });
            notify("", "bt");
        } else {
            answer(svc, method, { "returnValue": true });
        }
    }

    // Returns false for calls that are not the settings services'.
    function handle(svc, uri, method, params) {
        var p = params ? JSON.parse(params) : {};
        var service = uri.replace(/^(luna|palm):\/\//, "");
        if (["com.webos.settingsservice", "com.webos.service.tv.time", "com.webos.service.connectionmanager", "com.webos.audio",
             "com.webos.service.tv.display", "com.webos.service.tvpower", "com.webos.applicationManager",
             "com.webos.service.tv.systemproperty", "com.palm.systemservice",
             "com.webos.service.wifi", "com.webos.service.btaudiosrc", "com.webos.service.bluetooth2", "com.webos.notification"].indexOf(service) < 0) return false;
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
        } else if (service === "com.webos.service.wifi") {
            handleWifi(svc, method, p);
        } else if (service === "com.webos.service.btaudiosrc") {
            handleBt(svc, method, p);
        } else if (service === "com.webos.service.bluetooth2") {
            handleBt2(svc, method, p);
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
