import QtQuick 2.4
import ".."

QtObject {
    id: hook
    property Item host
    readonly property string handler: "themepackHandleHome"
    readonly property string before: "handleSystemKeys"
    readonly property string file: {
        var u = String(Qt.resolvedUrl("../../home-key.js"));
        return u.indexOf("file://") === 0 ? u.slice(7) : "";
    }
    property bool installed: false
    property var saved: null
    property bool connected: false

    function lgList() {
        var s = host && host.systemSettings, list = s ? s.keyFilters : undefined;
        return list && list.length !== undefined ? list : null;
    }
    function filter() { return host ? host.keyFilter : null; }

    property bool wanted: false
    function install() {
        var kf = filter(), lg = lgList();
        if (!kf || kf.keyFiltersChanged === undefined) { Look.report("gap", "home: LG's key filter not found; Home stays LG's"); return false; }
        if (!file) { Look.report("error", "home: the key filter script is not a local file; Home stays LG's"); return false; }
        wanted = true;
        if (!connected && host.systemSettings && host.systemSettings.keyFiltersChanged !== undefined) {
            host.systemSettings.keyFiltersChanged.connect(hook.reapply);
            connected = true;
        }
        if (!lg) { Look.report("waiting", "home: LG's key filter list is empty until configd answers"); return false; }
        var list = [], at = -1;
        for (var i = 0; i < lg.length; i++) {
            if (lg[i].handler === handler) continue;
            if (at < 0 && lg[i].handler === before) at = list.length;
            list.push({ "handler": lg[i].handler, "file": lg[i].file });
        }
        list.splice(at < 0 ? 0 : at, 0, { "handler": handler, "file": file });
        saved = JSON.parse(JSON.stringify(lg));
        kf.keyFilters = list;
        if (!installed) Look.report("ok", "home: the Home key opens our dock (key filter " + (at < 0 ? 1 : at + 1) + " of " + list.length + ")");
        installed = true;
        return true;
    }
    function reapply() { if (wanted) install(); }

    function restore() {
        if (connected) { try { host.systemSettings.keyFiltersChanged.disconnect(hook.reapply); } catch (e) { } }
        connected = false;
        wanted = false;
        if (!installed) return;
        installed = false;
        var kf = filter(), lg = lgList();
        var back = lg ? JSON.parse(JSON.stringify(lg)) : saved;
        if (kf && back) kf.keyFilters = back;
        Look.report("warning", "home: LG's key filter chain restored; Home opens LG's Home");
    }
}
