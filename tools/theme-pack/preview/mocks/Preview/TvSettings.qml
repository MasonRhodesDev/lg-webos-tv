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
        "support": {},
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
    // The Home dock's data. eim getAllInputStatus: the inputs, HDMI 2 watched (the foreground app), HDMI 4 renamed by
    // its owner. applicationManager listLaunchPoints: LG's apps and two installed ones (removable). An app id launched
    // through applicationManager/launch becomes the foreground app.
    property var inputs: [
        { "id": "AV_1", "label": "AV", "port": 1, "appId": "com.webos.app.externalinput.av1", "connected": true, "activate": false, "modified": false },
        { "id": "HDMI_1", "label": "HDMI 1", "port": 1, "appId": "com.webos.app.hdmi1", "connected": true, "activate": true, "hdmiPlugIn": true, "modified": false },
        { "id": "HDMI_2", "label": "HDMI 2", "port": 2, "appId": "com.webos.app.hdmi2", "connected": true, "activate": true, "hdmiPlugIn": true, "modified": false },
        { "id": "HDMI_3", "label": "HDMI 3", "port": 3, "appId": "com.webos.app.hdmi3", "connected": true, "activate": false, "hdmiPlugIn": false, "modified": false },
        { "id": "HDMI_4", "label": "Console", "port": 4, "appId": "com.webos.app.hdmi4", "connected": true, "activate": false, "hdmiPlugIn": false, "modified": true }
    ]
    property var launchPoints: [
        { "id": "com.webos.app.browser", "title": "Web Browser", "icon": "", "removable": false, "systemApp": true },
        { "id": "com.webos.app.photovideo", "title": "Photo & Video", "icon": "", "removable": false, "systemApp": true },
        { "id": "org.example.player", "title": "Player", "icon": "", "removable": true, "systemApp": false },
        { "id": "org.example.radio", "title": "Radio", "icon": "", "removable": true, "systemApp": false }
    ]
    property string foreground: "com.webos.app.hdmi2"
    // attachedstoragemanager listDevices: LG's internal stores, and a USB drive once a scene plugs one in.
    property var storage: [{ "deviceId": "INTERNAL_STORAGE_SAMPLE_PHOTO", "deviceUri": "/usr/palm/applications/com.webos.app.photovideo/assets/samplePhoto",
                             "deviceType": "internal sample photo", "deviceName": "Sample photos" }]
    function setForeground(appId) { foreground = appId; notify("", "foreground"); }

    // tv.systemproperty getSystemInfo and systemservice osInfo/query.
    property var system: ({ "modelName": "OLED55B9PUA", "firmwareVersion": "05.40.45", "core_os_release": "4.10.0" })
    // The Look service's getTelemetry: tools/telemetry-off in force this boot.
    property string telemetryKit: "active"
    // systemservice getPreferences: the first answer has every key asked for; a later post has only the key that
    // changed, and no returnValue. The time zone is a whole zone, one of `zones` (getPreferenceValues lists them: on
    // the TV a few hundred, here a handful, most of them the TV's own country's).
    property var preferences: ({ "useNetworkTime": false, "useNetworkTimeZone": true, "timeFormat": "HH12",
        "timeZone": { "ZoneID": "America/New_York", "City": "New York", "Description": "Eastern Time", "Country": "United States of America",
                      "CountryCode": "US", "offsetFromUTC": -300, "supportsDST": 1, "preferred": true } })
    property var zones: [
        zoneNamed("Pacific/Honolulu", "Honolulu", "Hawaii-Aleutian Time", "United States of America", "US", -600, 0),
        zoneNamed("America/Anchorage", "Anchorage", "Alaska Time", "United States of America", "US", -540, 1),
        zoneNamed("America/Los_Angeles", "Los Angeles", "Pacific Time", "United States of America", "US", -480, 1),
        zoneNamed("America/Denver", "Denver", "Mountain Time", "United States of America", "US", -420, 1),
        zoneNamed("America/Phoenix", "Phoenix", "Mountain Time", "United States of America", "US", -420, 0),
        zoneNamed("America/Chicago", "Chicago", "Central Time", "United States of America", "US", -360, 1),
        zoneNamed("America/New_York", "New York", "Eastern Time", "United States of America", "US", -300, 1),
        zoneNamed("America/Detroit", "Detroit", "Eastern Time", "United States of America", "US", -300, 1),
        zoneNamed("America/Toronto", "Toronto", "Eastern Time", "Canada", "CA", -300, 1),
        zoneNamed("Europe/London", "London", "Greenwich Mean Time", "United Kingdom", "GB", 0, 1),
        zoneNamed("Asia/Tokyo", "Tokyo", "Japan Time", "Japan", "JP", 540, 0)
    ]
    function zoneNamed(id, city, description, country, code, offset, dst) {
        return { "ZoneID": id, "City": city, "Description": description, "Country": country, "CountryCode": code,
                 "offsetFromUTC": offset, "supportsDST": dst };
    }
    // The clock (systemservice time/getSystemTime, time/setSystemTime), in seconds since 1970. It stands still, so a
    // scene shows the same minute on every run: Wednesday 11 November 2026, 9:41:05 PM in New York.
    property real clockUtc: Date.UTC(2026, 10, 12, 2, 41, 5) / 1000
    // The zone's offset at the clock's time, in minutes: an hour on from April to October where the zone keeps
    // daylight saving (near enough for a preview).
    function clockOffset() {
        var z = preferences.timeZone, month = new Date((clockUtc + z.offsetFromUTC * 60) * 1000).getUTCMonth();
        return z.offsetFromUTC + (z.supportsDST && month >= 3 && month <= 9 ? 60 : 0);
    }
    function systemTime() {
        var offset = clockOffset(), d = new Date((clockUtc + offset * 60) * 1000);
        return { "utc": clockUtc, "offset": offset, "timezone": preferences.timeZone.ZoneID, "isDST": offset !== preferences.timeZone.offsetFromUTC,
                 "systemTimeSource": preferences.useNetworkTime ? "ntp" : "manual", "timeValid": true,
                 "localtime": { "year": d.getUTCFullYear(), "month": d.getUTCMonth() + 1, "day": d.getUTCDate(),
                                "hour": d.getUTCHours(), "minute": d.getUTCMinutes(), "second": d.getUTCSeconds() } };
    }
    function prefsOf(keys, only) {
        var out = {}, n = 0;
        for (var i = 0; i < keys.length; i++) {
            if ((only && keys[i] !== only) || preferences[keys[i]] === undefined) continue;
            out[keys[i]] = preferences[keys[i]];
            n++;
        }
        return n ? out : null;
    }
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
    // "bt.disconnect", "bt.forget", "bt.search", "clock", "prefs.<key>") whose next write fails, to show the rollback.
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

    // Posts to the subscribers of one thing. For "prefs", `name` is the preference that changed (none: every one a
    // subscriber asked for).
    function notify(category, key, name) {
        for (var i = 0; i < subs.length; i++) {
            var s = subs[i];
            if (s.cancelled) continue;
            if (s.kind === "prefs" && key === "prefs") { var post = prefsOf(s.keys, name); if (post) answer(s.svc, "/getPreferences", post); }
            if (s.kind === "clock" && key === "clock") answer(s.svc, "/time/getSystemTime", systemTime());
            if (s.kind === "settings" && s.category === category && s.keys.indexOf(key) >= 0) answer(s.svc, "/getSystemSettings", settingsOf(category, s.keys));
            if (s.kind === "volume" && key === "volume") answer(s.svc, "/getVolume", { "returnValue": true, "volume": volume });
            if (s.kind === "signal" && key === "signal") answer(s.svc, "/getHDMIInfo", hdmi);
            if (s.kind === "wifi" && key === "wifi") answer(s.svc, "/getstatus", { "returnValue": true, "status": wifiState });
            if (s.kind === "networks" && key === "wifi") answer(s.svc, "/findnetworks", foundNetworks());
            if (s.kind === "bt" && key === "bt") answer(s.svc, "/device/getStatus", btStatus());
            if (s.kind === "foreground" && key === "foreground") answer(s.svc, "/getForegroundAppInfo", { "returnValue": true, "appId": foreground, "windowId": "", "processId": "" });
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
             "com.webos.service.wifi", "com.webos.service.btaudiosrc", "com.webos.service.bluetooth2", "com.webos.notification",
             "com.webos.service.eim", "com.webos.service.attachedstoragemanager"].indexOf(service) < 0) return false;
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
        } else if (service === "com.webos.service.eim" && method === "/getAllInputStatus") {
            answer(svc, method, { "returnValue": true, "devices": inputs, "totalCount": inputs.length });
        } else if (service === "com.webos.service.attachedstoragemanager" && method === "/listDevices") {
            answer(svc, method, { "returnValue": true, "devices": storage });
        } else if (service === "com.webos.applicationManager" && method === "/listLaunchPoints") {
            answer(svc, method, { "returnValue": true, "launchPoints": launchPoints });
        } else if (service === "com.webos.applicationManager" && method === "/getForegroundAppInfo") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "foreground" });
            answer(svc, method, { "returnValue": true, "appId": foreground, "windowId": "", "processId": "" });
        } else if (service === "com.webos.applicationManager" && method === "/launch") {
            answer(svc, method, { "returnValue": true });
            setForeground(p.id);
        } else if (service === "com.webos.service.tv.systemproperty" && method === "/getSystemInfo") {
            var info = { "returnValue": true };
            for (var i = 0; i < p.keys.length; i++) if (system[p.keys[i]] !== undefined) info[p.keys[i]] = system[p.keys[i]];
            answer(svc, method, info);
        } else if (service === "com.palm.systemservice" && method === "/osInfo/query") {
            answer(svc, method, { "returnValue": true, "core_os_release": system.core_os_release });
        } else if (service === "com.palm.systemservice" && method === "/getPreferences") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "prefs", "keys": p.keys || [] });
            var prefs = prefsOf(p.keys || []) || {};
            prefs.returnValue = true;
            answer(svc, method, prefs);
        } else if (service === "com.palm.systemservice" && method === "/setPreferences") {
            for (key in p) if (failing("prefs." + key, svc, method)) return true;
            for (key in p) preferences[key] = p[key];
            answer(svc, method, { "returnValue": true });
            for (key in p) notify("", "prefs", key);
        } else if (service === "com.palm.systemservice" && method === "/getPreferenceValues") {
            answer(svc, method, p.key === "timeZone" ? { "returnValue": true, "timeZone": zones } : { "returnValue": false, "errorText": "not mocked" });
        } else if (service === "com.palm.systemservice" && method === "/time/getSystemTime") {
            if (p.subscribe) subs.push({ "svc": svc, "kind": "clock" });
            var time = systemTime();
            time.returnValue = true;
            answer(svc, method, time);
        } else if (service === "com.palm.systemservice" && method === "/time/setSystemTime") {
            if (failing("clock", svc, method)) return true;
            clockUtc = p.utc;
            answer(svc, method, { "returnValue": true });
            // A set posts to the subscribers too (with no returnValue).
            notify("", "clock");
        } else {
            answer(svc, method, { "returnValue": true });
        }
        return true;
    }
}
