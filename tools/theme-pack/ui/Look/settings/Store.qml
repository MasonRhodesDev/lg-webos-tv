import QtQuick 2.4
import WebOSServices 1.0
import Look 1.0
import "catalog.js" as Catalog
import "menu.js" as Menu

// The settings data store (SETTINGS-PLAN.md, the data layer). It owns every read, subscription and write of our
// Settings and quick sheet; pages bind to it and never call the bus.
//
//   watch(refs) / unwatch(refs)  subscribe to the items a page shows (reference-counted per channel)
//   state(ref)                   { item, value, label, visible, active, options [{value, label, active}], min, max, step }
//   set(ref, value)              optimistic: the new value shows at once, and is rolled back if the write fails
//   act(ref)                     run an action item
//   holds(cond)                  a row condition: { ref, is: [values] } or { ref, not: [values] }
//
// Rows bind to `revision`, bumped on every change, plus their ref. A ref is a catalog item id (or "Page/id") or one of
// menu.js's `extra` items.
QtObject {
    id: store

    // Who our calls are from. SETTINGS-PLAN.md, bus identity: service/permissions.sh grants this name the groups.
    property string appId: "com.webos.surfacemanager.systemui"
    property int revision: 0
    // By storage key: "<category>.<key>" for settingsservice, the item id for everything else.
    property var values: ({})
    // settingsservice descriptions by storage key: { visible, active, values: [{ value, visible, active }], range }.
    property var desc: ({})
    // A write failed and was rolled back.
    signal failed(string ref, string text)
    // An action that belongs to the compositor: open a system UI (the input picker).
    signal systemUiRequested(string appId)

    readonly property string settings: "luna://com.webos.settingsservice"

    function item(ref) { return Menu.extra[ref] || Catalog.items[ref] || null; }
    // The item whose value an item shows: itself, or for a view (menu.js `from`) the item it views.
    function source(it) { return it && it.from ? item(it.from) : it; }
    function isSettings(it) { it = source(it); return !!it && !!it.api && it.api.service === "com.webos.settingsservice" && !!it.api.keys; }
    function keyOf(it) { it = source(it); return isSettings(it) ? it.api.category + "." + it.api.keys[0] : it.id; }

    // A channel is one subscription: a settingsservice category, or one of the other services.
    function channelOf(it) {
        it = source(it);
        if (!it || !it.api) return "";
        if (isSettings(it)) return "settings:" + it.api.category;
        var svc = it.api.service;
        if (svc === "com.webos.service.tv.time") return "sleep";
        if (svc === "com.webos.service.connectionmanager") return "network";
        if (svc === "com.webos.audio") return "volume";
        if (svc === "com.webos.service.tv.display" && it.api.read === "getHDMIInfo") return "signal";
        if (svc === "com.webos.service.tv.systemproperty" || svc === "com.palm.systemservice/osInfo") return "system";
        if (svc === "com.palm.systemservice" && it.api.read === "getPreferences") return "prefs";
        if (svc === "dev.themepack.look.service") return "kit";
        if (it.api.look) return "look";
        return "";
    }

    property var channels: ({})
    property Component serviceType: Component { Service { appId: store.appId } }
    function service() { return serviceType.createObject(store); }
    function drop(s) { if (!s) return; try { s.cancel(); } catch (e) {} s.destroy(); }
    function changed() { revision++; }

    function watch(refs) {
        for (var i = 0; i < refs.length; i++) {
            var it = source(item(refs[i])), name = channelOf(it);
            if (!name) continue;
            var ch = channels[name] || (channels[name] = { "count": 0, "keys": {}, "services": [] });
            ch.count++;
            if (isSettings(it)) {
                var k = it.api.keys[0];
                ch.keys[k] = (ch.keys[k] || 0) + 1;
                if (ch.keys[k] === 1) ch.dirty = true;
            } else if (ch.count === 1) {
                ch.dirty = true;
            }
        }
        for (var n in channels) if (channels[n].dirty) open(n);
    }

    function unwatch(refs) {
        for (var i = 0; i < refs.length; i++) {
            var it = source(item(refs[i])), name = channelOf(it), ch = channels[name];
            if (!ch) continue;
            ch.count--;
            if (isSettings(it)) { var k = it.api.keys[0]; if (--ch.keys[k] <= 0) delete ch.keys[k]; }
            if (ch.count <= 0) {
                close(name);
                delete channels[name];
                // Not known again until the next open reads it: a stale "active" must not outlive its answer.
                if (name === "kit") { delete values.telemetryKit; changed(); }
            }
        }
    }

    function close(name) {
        var ch = channels[name];
        if (!ch) return;
        for (var i = 0; i < ch.services.length; i++) drop(ch.services[i]);
        ch.services = [];
    }

    // (Re)opens a channel's subscriptions; a settings category re-subscribes with its whole key set.
    function open(name) {
        var ch = channels[name];
        ch.dirty = false;
        close(name);
        if (name.indexOf("settings:") === 0) {
            var category = name.slice(9), keys = [];
            for (var k in ch.keys) keys.push(k);
            if (!keys.length) return;
            var get = service(), d = service();
            get.response.connect(function (method, payload) { store.onSettings(category, payload); });
            d.response.connect(function (method, payload) { store.onDesc(category, payload); });
            get.call(settings, "/getSystemSettings", JSON.stringify({ "category": category, "keys": keys, "subscribe": true }));
            d.call(settings, "/getSystemSettingDesc", JSON.stringify({ "category": category, "keys": keys, "subscribe": true }));
            ch.services = [get, d];
        } else if (name === "sleep") {
            ch.services = [readSleep()];
        } else if (name === "network") {
            var net = service();
            net.response.connect(function (method, payload) { store.onNetwork(payload); });
            net.call("luna://com.webos.service.connectionmanager", "/getstatus", JSON.stringify({ "subscribe": true }));
            ch.services = [net];
        } else if (name === "volume") {
            var vol = service();
            vol.response.connect(function (method, payload) {
                var m = parse(payload);
                if (m && m.returnValue !== false && m.volume !== undefined && !store.pending.volume && !store.queued.volume) {
                    store.values.volume = m.volume;
                    store.changed();
                }
            });
            vol.call("luna://com.webos.audio", "/getVolume", JSON.stringify({ "subscribe": true }));
            ch.services = [vol];
        } else if (name === "signal") {
            var sig = service();
            sig.response.connect(function (method, payload) {
                var m = parse(payload);
                if (!m || m.returnValue === false) return;
                store.values.signal = { "HDMImode": m.HDMImode, "width": m.width, "height": m.height, "frameRate": m.frameRate, "scanType": m.scanType };
                store.changed();
            });
            sig.call("luna://com.webos.service.tv.display", "/getHDMIInfo", JSON.stringify({ "subscribe": true }));
            ch.services = [sig];
        } else if (name === "system") {
            // Read once: none of it changes while the TV runs.
            var sys = service(), os = service();
            sys.response.connect(function (method, payload) { store.onSystem(parse(payload), null); });
            os.response.connect(function (method, payload) { store.onSystem(null, parse(payload)); });
            sys.call("luna://com.webos.service.tv.systemproperty", "/getSystemInfo", JSON.stringify({ "keys": ["modelName", "firmwareVersion"] }));
            os.call("luna://com.palm.systemservice", "/osInfo/query", JSON.stringify({ "parameters": ["core_os_release"] }));
            ch.services = [sys, os];
        } else if (name === "kit") {
            // Read on each open: the boot hook applies some 35 s after power-on.
            var kit = service();
            kit.response.connect(function (method, payload) {
                var m = parse(payload);
                store.values.telemetryKit = m && m.returnValue !== false && m.kit ? m.kit : "unknown";
                store.changed();
            });
            kit.call("luna://dev.themepack.look.service", "/getTelemetry", "{}");
            ch.services = [kit];
        } else if (name === "prefs") {
            var prefs = service();
            prefs.response.connect(function (method, payload) {
                var m = parse(payload);
                if (!m || m.returnValue === false || m.useNetworkTime === undefined || store.pending.autoTime) return;
                store.values.autoTime = m.useNetworkTime ? "on" : "off";
                store.changed();
            });
            prefs.call("luna://com.palm.systemservice", "/getPreferences", JSON.stringify({ "keys": ["useNetworkTime"], "subscribe": true }));
            ch.services = [prefs];
        }
    }

    function parse(payload) { try { return JSON.parse(payload); } catch (e) { console.warn("settings store: unreadable " + payload); return null; } }

    function onSettings(category, payload) {
        var m = parse(payload);
        if (!m || m.returnValue === false || !m.settings) return;
        for (var k in m.settings) {
            var key = category + "." + k;
            if (pending[key] || queued[key]) continue;
            values[key] = m.settings[k];
        }
        changed();
    }
    function onDesc(category, payload) {
        var m = parse(payload);
        if (!m || m.returnValue === false) return;
        var list = m.results || [m];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            if (!r || !r.key) continue;
            var v = r.values || {};
            desc[category + "." + r.key] = {
                "visible": !r.ui || r.ui.visible !== false,
                "active": !r.ui || r.ui.active !== false,
                "values": v.arrayExt || null,
                "range": v.range || null
            };
        }
        changed();
    }
    function onNetwork(payload) {
        var m = parse(payload);
        if (!m || m.returnValue === false) return;
        var wired = m.wired || {}, wifi = m.wifi || {};
        values.wiredStatus = wired.state === "connected" ? "Connected" : "Not connected";
        values.wifiStatus = wifi.state === "connected" ? (wifi.ssid || "Connected") : "Not connected";
        var how = wired.state === "connected" ? "Wired" : wifi.state === "connected" ? "Wi-Fi" : "";
        values.networkStatus = m.isInternetConnectionAvailable ? "Online · " + how : how ? "Not reachable" : "Offline";
        values.internet = m.isInternetConnectionAvailable ? "Online" : "Offline";
        changed();
    }
    function onSystem(info, os) {
        if (info && info.returnValue !== false) {
            if (info.modelName) values.modelName = info.modelName;
            if (info.firmwareVersion) values.firmwareVersion = info.firmwareVersion;
        }
        if (os && os.returnValue !== false && os.core_os_release) values.osRelease = os.core_os_release;
        var webos = values.osRelease ? "webOS " + values.osRelease : "";
        values.tvVersion = [webos, values.firmwareVersion || ""].filter(function (x) { return !!x; }).join(" \u00b7 ") || undefined;
        values.tvSummary = [values.modelName || "", webos].filter(function (x) { return !!x; }).join(" \u00b7 ") || undefined;
        changed();
    }

    // tv.time answers a subscription once and never again, so the store reads it again after each write.
    function readSleep() {
        var s = service();
        s.response.connect(function (method, payload) {
            var m = parse(payload);
            if (!m || m.returnValue === false || m.sleepTimeMinute === undefined) return;
            store.values.sleepTimer = m.sleepTimeMinute > 0 ? String(m.sleepTimeMinute) : "off";
            store.changed();
        });
        s.call("luna://com.webos.service.tv.time", "/getSleepTimeInfo", JSON.stringify({ "subscribe": true }));
        return s;
    }

    function rawValue(it) {
        if (!it) return undefined;
        if (it.api && it.api.look === "style") return Look.chosen.style;
        return values[keyOf(it)];
    }

    function holds(cond) {
        if (!cond) return true;
        var v = rawValue(item(cond.ref));
        if (v === undefined) return true;
        if (cond.is) return cond.is.indexOf(v) >= 0;
        if (cond.not) return cond.not.indexOf(v) < 0;
        return true;
    }

    function options(it) {
        var out = [], i;
        if (it.api && it.api.look === "style") {
            var styles = Look.available.styles || [];
            for (i = 0; i < styles.length; i++) out.push({ "value": styles[i].id, "label": styles[i].name, "active": true });
            return out;
        }
        var d = desc[keyOf(it)];
        if (d && d.values) {
            for (i = 0; i < d.values.length; i++) {
                var e = d.values[i];
                if (e.visible === false) continue;
                out.push({ "value": e.value, "label": Menu.valueLabel(it.id, e.value), "active": e.active !== false });
            }
            return out;
        }
        var vals = it.domain && it.domain.values || [];
        for (i = 0; i < vals.length; i++) out.push({ "value": vals[i], "label": Menu.valueLabel(it.id, vals[i]), "active": true });
        return out;
    }

    function state(ref) {
        var it = item(ref);
        if (!it) return { "item": null, "visible": false, "active": false, "value": undefined, "label": "", "options": [] };
        var d = desc[keyOf(it)] || {}, range = d.range || it.domain || {}, v = rawValue(it), label = "";
        if (it.api && it.api.look === "style") {
            var styles = Look.available.styles || [];
            for (var i = 0; i < styles.length; i++) if (styles[i].id === v) label = styles[i].name;
        } else if (it.id === "signal" || it.from === "signal") {
            // Only an HDMI input has a signal to describe; an unknown input may still be one.
            var input = values["dimensionInfo.input"];
            label = input !== undefined && String(input).indexOf("hdmi") !== 0 ? ""
                  : it.id === "signal" ? Menu.signalLabel(v) : Menu.valueLabel(it.id, v);
        } else if (it.id === "telemetry") {
            label = Menu.telemetryLabel(values.telemetryKit, v);
        } else {
            label = it.type === "info" && typeof v === "string" && !Menu.labels[it.id] ? v : Menu.valueLabel(it.id, v);
        }
        return {
            "item": it,
            "value": v,
            "label": label,
            "visible": d.visible !== false,
            "active": d.active !== false,
            "options": it.type === "enum" || it.type === "switch" ? options(it) : [],
            "min": range.min !== undefined ? range.min : 0,
            "max": range.max !== undefined ? range.max : 100,
            "step": range.step || range.interval || 1
        };
    }

    // Writes in flight by storage key: { previous, ref }. Sliders send at most every 100 ms, always the last value.
    property var queued: ({})
    property var flush: Timer {
        interval: 100
        onTriggered: {
            var q = store.queued;
            store.queued = {};
            for (var k in q) store.send(q[k].ref, q[k].value, q[k].previous);
        }
    }

    function set(ref, value) {
        var it = item(ref);
        if (!it) return;
        if (it.api && it.api.look === "style") { Look.setLook({ "style": value }); return; }
        var key = keyOf(it), previous = values[key];
        if (previous === value) return;
        values[key] = value;
        changed();
        if (it.type === "range") {
            var q = queued[key];
            queued[key] = { "ref": ref, "value": value, "previous": q ? q.previous : previous };
            if (!flush.running) flush.start();
            return;
        }
        send(ref, value, previous);
    }

    // A call that expects one answer: answered(message) when it comes, unanswered() if none comes within
    // writeTimeout (a missing bus group drops calls silently). Its Service is destroyed either way.
    property int writeTimeout: 5000
    property var inflight: []
    function request(uri, method, params, answered, unanswered) {
        var s = service(), e = { "s": s, "at": new Date().getTime() + writeTimeout, "unanswered": unanswered, "done": false };
        inflight.push(e);
        s.response.connect(function (m, payload) {
            if (e.done) return;
            e.done = true;
            store.retire(e);
            if (answered) answered(store.parse(payload));
        });
        s.call(uri, method, params);
        if (!watchdog.running) watchdog.start();
    }
    function retire(e) {
        var i = inflight.indexOf(e);
        if (i >= 0) inflight.splice(i, 1);
        e.s.destroy();
    }
    property var watchdog: Timer {
        interval: 250
        repeat: true
        onTriggered: {
            var now = new Date().getTime(), list = store.inflight.slice();
            for (var i = 0; i < list.length; i++) {
                if (list[i].done || now < list[i].at) continue;
                list[i].done = true;
                store.retire(list[i]);
                if (list[i].unanswered) list[i].unanswered();
            }
            if (!store.inflight.length) stop();
        }
    }

    // Writes in flight by storage key. While one is pending, the subscription's echoes of that key are ignored, so a
    // slider being moved doesn't jump back to an older value.
    property var pending: ({})

    function send(ref, value, previous) {
        var it = item(ref), key = keyOf(it), uri = "", method = "", params = null;
        if (isSettings(it)) {
            var settingsObj = {};
            settingsObj[it.api.keys[0]] = value;
            params = { "category": it.api.category, "settings": settingsObj };
            // LG writes these per app, as its own Settings does.
            if (it.id === "truMotionMode" || it.id === "arcPerApp") params.current_app = true;
            uri = settings; method = "/setSystemSettings";
        } else if (it.api.service === "com.webos.service.tv.time") {
            uri = "luna://com.webos.service.tv.time"; method = "/setSleepTimeInfo";
            params = { "sleepTimeMinute": value === "off" ? 0 : Number(value) };
        } else if (it.api.service === "com.webos.audio") {
            uri = "luna://com.webos.audio"; method = "/setVolume"; params = { "volume": value };
        } else if (it.api.service === "com.palm.systemservice" && it.api.write === "setPreferences") {
            uri = "luna://com.palm.systemservice"; method = "/setPreferences";
            params = {};
            params[it.api.keys[0]] = value === "on";
        } else {
            console.warn("settings store: no writer for " + ref);
            return;
        }
        pending[key] = (pending[key] || 0) + 1;
        function settle() { if (--store.pending[key] <= 0) delete store.pending[key]; }
        function rollback(text) {
            if (store.values[key] === value) { store.values[key] = previous; store.changed(); }
            store.failed(ref, text);
        }
        request(uri, method, JSON.stringify(params), function (m) {
            settle();
            if (!m || m.returnValue === false) rollback(m && m.errorText ? m.errorText : "not saved");
            else if (it.api.service === "com.webos.service.tv.time") {
                var ch = store.channels.sleep;
                if (ch) { store.drop(ch.services[0]); ch.services = [store.readSleep()]; }
            }
        }, function () { settle(); rollback("the TV did not answer"); });
        if (it.id === "pictureMode")
            request("luna://com.webos.service.tv.display", "/setPSMChangedByUser", JSON.stringify({ "pictureMode": value }), null, null);
    }

    function act(ref) {
        var it = item(ref);
        if (!it || !it.api) return;
        if (it.api.systemui) { systemUiRequested(it.api.systemui); return; }
        if (!it.api.service || !it.api.method) { console.warn("settings store: no action for " + ref); return; }
        request("luna://" + it.api.service, "/" + it.api.method, JSON.stringify(it.api.params || {}), function (m) {
            if (!m || m.returnValue === false) store.failed(ref, m && m.errorText ? m.errorText : "did not run");
        }, function () { store.failed(ref, "the TV did not answer"); });
    }

    // Our own Look's values come from the Look service, through Look.
    Component.onCompleted: { Look.chosenChanged.connect(store.changed); Look.availableChanged.connect(store.changed); }
    Component.onDestruction: { Look.chosenChanged.disconnect(store.changed); Look.availableChanged.disconnect(store.changed); }
}
