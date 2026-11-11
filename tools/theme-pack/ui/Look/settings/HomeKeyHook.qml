import QtQuick 2.4
import ".."

// Puts the Home key's filter (ui/home-key.js) into LG's key filter chain, in memory only. LG's key filter object
// (`host.keyFilter`) holds the live chain as `keyFilters`, bound to configd's list on `host.systemSettings`; assigning
// it reloads every filter in the list. The new list is LG's with our entry just ahead of LG's Home handling, so the
// filters before it (screen saver, accessibility and the like) still see every key first.
//
// Nothing is written to configd: a compositor restart or a reboot gives LG's chain back. While installed, a change to
// configd's list is followed (the list is made again from it). restore() puts LG's list back as a plain value: a
// binding made here would stop when this layer goes, on Qt 5.6.
QtObject {
    id: hook
    property Item host
    readonly property string handler: "themepackHandleHome"
    // LG's own Home handling; ours goes just before it, or first if LG's is not found.
    readonly property string before: "handleSystemKeys"
    // A filesystem path: LG's key filter loads files by plain path.
    readonly property string file: {
        var u = String(Qt.resolvedUrl("../../home-key.js"));
        return u.indexOf("file://") === 0 ? u.slice(7) : "";
    }
    property bool installed: false
    // LG's list as it was when installed, should configd's value be missing at restore.
    property var saved: null
    property bool connected: false

    function lgList() {
        var s = host && host.systemSettings, list = s ? s.keyFilters : undefined;
        return list && list.length !== undefined ? list : null;
    }
    function filter() { return host ? host.keyFilter : null; }

    // Wanted and not yet installed: configd's list has not come yet; it is installed when it does.
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

    // Idempotent; a hook never installed changes nothing.
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
