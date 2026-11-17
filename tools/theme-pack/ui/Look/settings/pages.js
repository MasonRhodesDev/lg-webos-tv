.pragma library
.import "catalog.js" as Catalog
.import "menu.js" as Menu

function words(id) { return Menu.words(id); }

function resolve(id) { return Menu.aliases[id] || id; }

function categoryOf(id) {
    for (var i = 0; i < Menu.categories.length; i++) if (Menu.categories[i].id === id) return Menu.categories[i];
    return null;
}
function topOf(category) { var c = categoryOf(category); return c ? c.page : Menu.categories[0].page; }

function categoryFor(id) {
    id = resolve(id);
    var d = Menu.pages[id];
    if (d) return d.category;
    if (id.indexOf("pick:") === 0 || id.indexOf("adjust:") === 0) return "";
    var c = Catalog.catalog.pages[id];
    return c ? Menu.home[c.category] || Menu.categories[0].id : "";
}

function exists(id) { id = resolve(id); return !!(Menu.pages[id] || Catalog.catalog.pages[id]); }

function pathTo(id) {
    id = resolve(id);
    var cat = categoryFor(id), top = topOf(cat), c = Catalog.catalog.pages[id];
    var path = c ? c.lgPath.slice() : [id];
    if (c && Menu.pages[id] && Menu.home[c.category] !== Menu.pages[id].category) path = [id];
    if (path[0] !== top) path.unshift(top);
    var out = [];
    for (var i = 0; i < path.length; i++) if (exists(path[i]) && out.indexOf(path[i]) < 0) out.push(path[i]);
    return out;
}

function target(name) {
    if (!name) return [];
    name = resolve(name);
    if (categoryOf(name)) return [categoryOf(name).page];
    if (exists(name)) return pathTo(name);
    var lg = Catalog.catalog.targets[name];
    if (lg) {
        for (var i = lg.length - 1; i >= 0; i--) if (exists(lg[i])) return pathTo(lg[i]);
    }
    return [Menu.categories[0].page];
}

function children(id) {
    var out = [];
    for (var i = 0; i < Catalog.catalog.order.length; i++) {
        var p = Catalog.catalog.pages[Catalog.catalog.order[i]], n = p.lgPath.length;
        if (n > 1 && p.lgPath[n - 2] === id && !p.region) out.push(p);
    }
    return out;
}

function definition(entry) {
    var id = resolve(entry.id), d = id === "quick" ? Menu.quick : Menu.pages[id];
    if (d) return d;
    var c = Catalog.catalog.pages[id];
    if (!c) return { "title": words(id), "rows": [] };
    var rows = [];
    for (var i = 0; i < c.items.length; i++) {
        var it = c.items[i];
        if (it.region) continue;
        if (it.type === "page") rows.push({ "page": it.opens, "label": words(it.id), "hint": it.meaning });
        else rows.push({ "item": id + "/" + it.id, "label": words(it.id), "hint": it.meaning });
    }
    var linked = {}, kids = children(id);
    for (i = 0; i < rows.length; i++) if (rows[i].page) linked[rows[i].page] = true;
    for (i = 0; i < kids.length; i++) if (!linked[kids[i].id]) rows.push({ "page": kids[i].id, "label": words(kids[i].id), "hint": kids[i].meaning });
    return { "title": words(id), "rows": rows };
}

function expanded(entry) {
    var d = definition(entry), out = [], used = {}, i, j;
    for (i = 0; i < d.rows.length; i++) {
        if (d.rows[i].item) used[d.rows[i].item] = true;
        if (d.rows[i].action) used[d.rows[i].action] = true;
        if (d.rows[i].page) used["page:" + d.rows[i].page] = true;
    }
    for (i = 0; i < d.rows.length; i++) {
        var r = d.rows[i];
        if (r.more === undefined) { out.push(r); continue; }
        var cat = Catalog.catalog.categories, top = null;
        for (j = 0; j < Catalog.catalog.order.length; j++) {
            var p = Catalog.catalog.pages[Catalog.catalog.order[j]];
            if (p.category === r.more && p.lgPath.length === 1) { top = p; break; }
        }
        if (!top) continue;
        if (top.id !== entry.id) {
            if (!used["page:" + top.id]) { out.push({ "page": top.id, "label": words(top.id), "hint": top.meaning }); used["page:" + top.id] = true; }
            continue;
        }
        var more = [];
        for (j = 0; j < top.items.length; j++) {
            var it = top.items[j];
            if (it.region) continue;
            if (it.type === "page") {
                if (used["page:" + it.opens]) continue;
                used["page:" + it.opens] = true;
                more.push({ "page": it.opens, "label": words(it.id), "hint": it.meaning });
            } else if (!used[it.id] && !used[top.id + "/" + it.id]) {
                more.push({ "item": top.id + "/" + it.id, "label": words(it.id), "hint": it.meaning });
            }
        }
        var kids = children(top.id);
        for (j = 0; j < kids.length; j++) {
            if (used["page:" + kids[j].id]) continue;
            used["page:" + kids[j].id] = true;
            more.push({ "page": kids[j].id, "label": words(kids[j].id), "hint": kids[j].meaning });
        }
        if (more.length) { out.push({ "section": "More" }); out = out.concat(more); }
    }
    return { "title": d.title, "sub": d.sub, "rows": out };
}

function subRefs(sub) { return !sub || !sub.from ? [] : typeof sub.from === "string" ? [sub.from] : sub.from; }

function refs(entry) {
    var out = [];
    if (entry.ref) out.push(entry.ref);
    out = out.concat(subRefs(entry.subSpec));
    if (entry.id === "Look") return out;
    var rows = expanded(entry).rows, d = definition(entry);
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].item) out.push(rows[i].item);
        if (rows[i].value) out.push(rows[i].value);
        if (rows[i].action) out.push(rows[i].action);
        if (rows[i].activeWhen) out.push(rows[i].activeWhen.ref);
        if (rows[i].hintWhen) out.push(rows[i].hintWhen.ref);
        if (rows[i].list) out.push(rows[i].list);
        if (rows[i].text) out.push(rows[i].text);
        if (rows[i].pin || rows[i].changePin) out.push("Safety/systemPin");
    }
    var c = Catalog.catalog.pages[resolve(entry.id)];
    if (c && c.category === "safety") out.push("Safety/systemPin");
    return out.concat(subRefs(d.sub));
}

function subtitle(sub, store) {
    if (!sub) return "";
    if (typeof sub === "string") return sub;
    var from = subRefs(sub), parts = [];
    for (var i = 0; i < from.length; i++) { var l = store.state(from[i]).label; if (l) parts.push(l); }
    if (!parts.length) return "";
    var label = parts.join(" \u00b7 ");
    return sub.format ? sub.format.replace("%s", label) : label;
}

var footerRefs = ["internet", "telemetryKit", "telemetry"];
function footer(store) { return subtitle({ "from": footerRefs }, store); }

function title(entry) { return entry.title || expanded(entry).title; }

function isOn(st, spec) {
    var v = st.value;
    if (spec.as === "toggle") return v !== undefined && v !== spec.off;
    return v === "on" || v === true || v === "true" || v === "enabled";
}
function switchValues(it, spec, v) {
    if (spec.as === "toggle") return [spec.on, spec.off];
    if (v === "on" || v === "off") return ["on", "off"];
    if (v === true || v === false) return [true, false];
    if (v === "true" || v === "false") return ["true", "false"];
    if (v === "enabled" || v === "disabled") return ["enabled", "disabled"];
    var vals = it.domain && it.domain.values || [];
    if (vals.indexOf(true) >= 0) return [true, false];
    if (vals.indexOf("true") >= 0) return ["true", "false"];
    if (vals.indexOf("enabled") >= 0) return ["enabled", "disabled"];
    return ["on", "off"];
}

function row(spec, store, hue) {
    var r = { "label": spec.label, "icon": spec.icon || "", "hue": hue, "hint": spec.hint || "" };
    if (spec.section !== undefined) return { "section": spec.section };
    if (spec.pin && !store.unlocked) r.locked = true;
    if (spec.hintWhen && (store.state(spec.hintWhen.ref).value === undefined || !store.holds(spec.hintWhen))) r.hint = "";
    if (spec.missing) {
        r.variant = spec.as === "toggle" ? "toggle" : spec.as === "value" ? "value" : "info";
        r.kind = "";
        r.disabled = true;
        r.hint = spec.missing;
        return r;
    }
    if (spec.settings) { r.variant = "nav"; r.kind = "settings"; return r; }
    if (spec.changePin) { r.variant = "nav"; r.kind = "changePin"; return r; }
    if (spec.page) {
        r.variant = "nav";
        r.kind = "page";
        r.entry = { "id": resolve(spec.page) };
        if (spec.value) r.value = store.state(spec.value).label;
        if (!store.holds(spec.activeWhen)) { r.disabled = true; if (spec.why) r.hint = spec.why; }
        return r;
    }
    var ref = spec.item || spec.action || spec.text, st = store.state(ref), it = st.item;
    if (!it || !st.visible) return null;
    r.ref = ref;
    r.spec = spec;
    var ok = st.active && store.holds(spec.activeWhen);
    if (!ok) { r.disabled = true; if (spec.why) r.hint = spec.why; }
    var text = Menu.texts[it.id];
    if (spec.text || text) {
        r.variant = "value";
        r.kind = "text";
        r.text = st.value === undefined || st.value === null ? "" : String(st.value);
        r.value = r.text;
        r.limits = text || {};
        return r;
    }
    if (spec.action || it.type === "action") { r.variant = spec.drill ? "nav" : "action"; r.kind = "action"; return r; }
    r.kind = "item";
    if (it.type === "switch" && spec.as === "value") { r.variant = "value"; r.value = st.label; return r; }
    if (spec.as === "toggle" || it.type === "switch") { r.variant = "toggle"; r.on = isOn(st, spec); r.values = switchValues(it, spec, st.value); return r; }
    if (it.type === "range") {
        var v = typeof st.value === "number" ? st.value : st.min;
        if (spec.as === "value") { r.variant = "value"; r.adjust = true; r.value = st.value === undefined ? "" : st.label; return r; }
        r.variant = "slider";
        r.fraction = st.max > st.min ? (v - st.min) / (st.max - st.min) : 0;
        r.valueText = st.value === undefined ? "" : st.label;
        return r;
    }
    if (it.type === "enum") { r.variant = "value"; r.value = st.label; return r; }
    if (it.type === "step") {
        var opts = st.options || [];
        r.variant = "stepper";
        r.options = [];
        r.values = [];
        r.index = 0;
        for (var i = 0; i < opts.length; i++) {
            r.options.push(opts[i].label);
            r.values.push(opts[i].value);
            if (opts[i].value === st.value) r.index = i;
        }
        if (!opts.length) r.disabled = true;
        return r;
    }
    if (it.type === "info") { r.variant = "info"; r.value = st.label; return r; }
    r.variant = "info";
    r.kind = "";
    r.disabled = true;
    r.hint = "Not in our Settings yet";
    return r;
}

var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateSpan(d) {
    var a = /^(\d+)-(\d\d)-(\d\d)$/.exec(d && d.from || ""), b = /^(\d+)-(\d\d)-(\d\d)$/.exec(d && d.to || "");
    if (!a || !b || !MONTHS[a[2] - 1] || !MONTHS[b[2] - 1]) return "";
    var from = MONTHS[a[2] - 1] + " " + Number(a[3]), sameMonth = a[1] === b[1] && a[2] === b[2];
    if (sameMonth && a[3] === b[3]) return from;
    return from + " \u2013 " + (sameMonth ? "" : MONTHS[b[2] - 1] + " ") + Number(b[3]);
}
function seasonDates(theme) {
    var out = [], dates = theme.dates || [];
    for (var i = 0; i < dates.length; i++) { var s = dateSpan(dates[i]); if (s) out.push(s); }
    return out.join(", ");
}
function seasonal(Look) {
    var out = [], themes = Look.available.themes || [];
    for (var i = 0; i < themes.length; i++) if (themes[i].group === "seasonal") out.push(themes[i]);
    return out;
}
function seasonPicked(Look, id) {
    var out = [], on = Look.chosen.themes || [], season = seasonal(Look), ids = [], i;
    for (i = 0; i < season.length; i++) ids.push(season[i].id);
    for (i = 0; i < on.length; i++) if (ids.indexOf(on[i]) < 0) out.push(on[i]);
    if (id) out.push(id);
    return out;
}
function skipFlipped(Look, id) {
    var out = (Look.chosen.skip || []).slice(), at = out.indexOf(id);
    if (at >= 0) out.splice(at, 1); else out.push(id);
    return out;
}

function lookRows(store, Look) {
    var out = [{ "section": "Style" }], styles = Look.available.styles || [], themes = Look.available.themes || [], i;
    for (i = 0; i < styles.length; i++)
        out.push({ "variant": "choice", "label": styles[i].name, "icon": "palette", "hue": i, "kind": "style", "value": "",
                   "choice": styles[i].id, "checked": styles[i].id === Look.chosen.style, "current": styles[i].id === Look.chosen.style });
    var on = Look.chosen.themes || [], season = seasonal(Look), hue = styles.length;
    if (season.length) {
        var auto = !!Look.chosen.auto, skip = Look.chosen.skip || [], now = [];
        for (i = 0; i < season.length; i++) if (on.indexOf(season[i].id) >= 0) now.push(season[i].name);
        out.push({ "section": "Seasonal themes" });
        out.push({ "variant": "toggle", "label": "Automatic", "icon": "clock", "hue": hue++, "kind": "auto", "on": auto,
                   "hint": !auto ? "Follow the calendar: a season, and a holiday over it"
                                 : now.length ? "On now: " + now.join(", ") : "Nothing is in season today" });
        if (auto) out.push({ "section": "In the calendar" });
        else out.push({ "variant": "radio", "label": "None", "icon": "close", "kind": "season", "choice": "", "checked": !now.length });
        for (i = 0; i < season.length; i++) {
            var active = on.indexOf(season[i].id) >= 0, dates = seasonDates(season[i]);
            var r = { "label": season[i].name, "icon": "leaf", "hue": hue++, "choice": season[i].id, "current": active };
            if (auto) {
                r.variant = "toggle"; r.kind = "skip"; r.on = skip.indexOf(season[i].id) < 0;
                r.hint = dates + (active ? (dates ? " \u00b7 " : "") + "On now" : "");
            } else {
                r.variant = "radio"; r.kind = "season"; r.checked = active; r.hint = dates;
            }
            out.push(r);
        }
    }
    out.push({ "section": "Themes" });
    for (i = 0; i < themes.length; i++) {
        if (themes[i].group === "seasonal") continue;
        out.push({ "variant": "toggle", "label": themes[i].name, "hint": themes[i].description || "", "icon": "sparkle",
                   "hue": hue++, "kind": "theme", "choice": themes[i].id, "on": on.indexOf(themes[i].id) >= 0 });
    }
    return out;
}

function pickerRows(entry, store) {
    var st = store.state(entry.ref), out = [], opts = st.options, hints = st.item && Menu.hints[st.item.id] || {};
    for (var i = 0; i < opts.length; i++) {
        var cur = st.value !== undefined && String(opts[i].value) === String(st.value);
        out.push({ "variant": "choice", "label": opts[i].label, "icon": entry.icon || "", "hue": i,
                   "hint": cur ? "Current" : hints[opts[i].value] || "",
                   "checked": cur, "current": cur, "disabled": !opts[i].active, "kind": "choose", "ref": entry.ref, "choice": opts[i].value });
    }
    if (entry.then) {
        out.push({ "variant": "nav", "label": entry.then.label.replace("%s", st.label), "icon": entry.then.icon || "", "hue": out.length,
                   "kind": "page", "entry": { "id": entry.then.page } });
    }
    return out;
}

function lockedPage(id, store) {
    var c = Catalog.catalog.pages[resolve(id)];
    return !!c && c.category === "safety" && c.lgPath.length > 1 && !store.unlocked;
}

function model(entry, store, Look) {
    if (lockedPage(entry.id, store)) return [];
    if (entry.id === "Look") return lookRows(store, Look);
    if (entry.id.indexOf("pick:") === 0) return pickerRows(entry, store);
    if (entry.id.indexOf("adjust:") === 0) {
        var r = row({ "item": entry.ref, "label": entry.title, "icon": entry.icon }, store, 0);
        return r ? [r] : [];
    }
    var specs = expanded(entry).rows, out = [], n = 0;
    for (var i = 0; i < specs.length; i++) {
        var made = specs[i].list ? listRows(specs[i], store) : [row(specs[i], store, specs[i].section !== undefined ? -1 : n % 7)];
        for (var j = 0; j < made.length; j++) {
            var x = made[j];
            if (!x) continue;
            if (x.section === undefined) { if (specs[i].list) x.hue = n % 7; n++; }
            if (x.section !== undefined && out.length && out[out.length - 1].section !== undefined) out.pop();
            out.push(x);
        }
    }
    if (out.length && out[out.length - 1].section !== undefined) out.pop();
    return out;
}

var SIGNAL = ["", "Weak signal", "Fair signal", "Good signal", "Strong signal"];
var NET_STATUS = { "connected": "Connected", "connecting": "Joining", "saved": "Saved", "new": "" };
var DEV_STATUS = { "connected": "Connected", "connecting": "Connecting", "disconnecting": "Disconnecting", "paired": "Not connected", "new": "" };
function listRows(spec, store) {
    if (!store.list) return [];
    var l = store.list(spec.list), out = [], i;
    if (spec.list === "wifiNetworks") {
        if (store.state("wifiEnabled").value === "disabled")
            return [{ "variant": "info", "label": "Wi-Fi is off", "hint": "Turn it on to see networks", "icon": "wifi" }];
        var saved = [], nearby = [];
        for (i = 0; i < l.length; i++) {
            var net = l[i], b = Math.max(1, Math.min(4, net.bars));
            var r = { "variant": "action", "kind": "network", "net": net, "label": net.name, "icon": b <= 1 ? "wifi1" : b === 2 ? "wifi2" : "wifi",
                      "hint": (net.secure ? "Secured" : "Open") + " · " + SIGNAL[b], "value": NET_STATUS[net.status] || "",
                      "busy": net.status === "connecting", "current": net.status === "connected" };
            if (net.status === "new") nearby.push(r); else saved.push(r);
        }
        if (saved.length) out = out.concat([{ "section": "Saved" }], saved);
        out.push({ "section": "Nearby" });
        out = out.concat(nearby);
        if (!nearby.length) out.push({ "variant": "info", "label": store.busy("wifiNetworks") ? "Looking for networks" : "No other networks in range",
                                       "icon": "wifi", "busy": store.busy("wifiNetworks") });
        return out;
    }
    if (spec.list === "btDevices") {
        var paired = [], found = [];
        for (i = 0; i < l.length; i++) {
            var d = l[i];
            var dr = { "variant": "action", "kind": "device", "dev": d, "label": d.name, "icon": /head/i.test(d.type + d.name) ? "headphones" : /bar/i.test(d.name) ? "soundbar" : "speaker",
                       "value": DEV_STATUS[d.status] || "", "busy": d.status === "connecting" || d.status === "disconnecting", "current": d.status === "connected" };
            if (d.paired) paired.push(dr); else found.push(dr);
        }
        if (paired.length) out = out.concat([{ "section": "Paired" }], paired);
        out.push({ "section": "Nearby" });
        out = out.concat(found);
        var searching = store.busy("btDevices");
        out.push({ "variant": "action", "kind": "search", "ref": spec.list, "label": searching ? "Searching for devices" : "Search for devices",
                   "hint": searching ? "Put the speaker or headphones in pairing mode" : "", "icon": "bt", "busy": searching, "disabled": searching });
        return out;
    }
    return [];
}

function choices(r, store) {
    if (!r) return null;
    if (r.kind === "network") {
        var n = r.net;
        if (n.status === "connected")
            return { "title": n.name, "body": "Connected. Forget it and the TV stops joining it; you will need its password again.",
                     "icon": r.icon, "buttons": ["Cancel", "Forget"], "ops": ["", "forget"] };
        if (n.status === "saved")
            return { "title": "Join " + n.name + "?", "body": "Saved on this TV. Joining drops the network the TV is on now.",
                     "icon": r.icon, "buttons": ["Cancel", "Forget", "Join"], "ops": ["", "forget", "join"] };
        if (n.status === "new" && !n.secure)
            return { "title": "Join " + n.name + "?", "body": "An open network: what the TV sends can be seen by anyone nearby.",
                     "icon": r.icon, "buttons": ["Cancel", "Join"], "ops": ["", "join"] };
        return null;
    }
    if (r.kind === "device") {
        var d = r.dev;
        if (!d.paired)
            return { "title": "Pair " + d.name + "?", "body": "Sound moves to it once it is paired.",
                     "icon": r.icon, "buttons": ["Cancel", "Pair"], "ops": ["", "pair"] };
        if (d.status === "connected")
            return { "title": d.name, "body": "Connected: the TV's sound plays on it.",
                     "icon": r.icon, "buttons": ["Cancel", "Forget", "Disconnect"], "ops": ["", "forget", "disconnect"] };
        return { "title": d.name, "body": "Paired, not connected.",
                 "icon": r.icon, "buttons": ["Cancel", "Forget", "Connect"], "ops": ["", "forget", "connect"] };
    }
    if (r.kind === "item" && r.variant === "toggle" && r.on && r.spec && r.spec.confirmOff)
        return { "title": r.label, "body": r.spec.confirmOff, "icon": r.icon, "buttons": ["Cancel", "Turn off"], "ops": ["", "run"] };
    var c = confirmation(r, store);
    return c ? { "title": r.label, "body": c, "icon": r.icon, "buttons": ["Cancel", "OK"], "ops": ["", "run"] } : null;
}

function textRequest(r) {
    if (r.kind === "network" && r.net.status === "new" && r.net.secure)
        return { "label": "Password for " + r.net.name, "text": "", "min": r.net.securityType === "wep" ? 5 : 8, "max": 63, "secret": true,
                 "done": "Join", "layout": "letters", "op": "join", "row": r };
    if (r.kind === "text")
        return { "label": r.label, "text": r.text, "min": r.limits.min || 0, "max": r.limits.max || 0, "secret": false,
                 "done": "Done", "layout": r.limits.layout || "letters", "op": "set", "row": r };
    return null;
}

function confirmation(r, store) {
    if (r.kind !== "action" || !r.ref) return "";
    var it = store.item(r.ref), c = it && it.confirm;
    return typeof c === "string" && c.indexOf("?") >= 0 ? c : "";
}

function landing(entry, rows) {
    var i;
    for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.section !== undefined || r.variant === "info" || r.disabled) continue;
        if (entry.focusRef ? r.ref === entry.focusRef : entry.id.indexOf("pick:") === 0 ? r.checked : false) return i;
    }
    for (i = 0; i < rows.length; i++) if (rows[i].section === undefined && rows[i].variant !== "info" && !rows[i].disabled) return i;
    return 0;
}

function drill(r, crumb) {
    var it = r.spec || {};
    if (r.adjust)
        return { "id": "adjust:" + r.ref, "ref": r.ref, "title": r.label, "icon": r.icon, "crumb": crumb, "subSpec": it.sub };
    return { "id": "pick:" + r.ref, "ref": r.ref, "title": r.label, "icon": r.icon, "then": it.then, "crumb": crumb, "subSpec": it.sub };
}

function stepped(store, ref, delta) {
    var st = store.state(ref), v = st.value;
    if (typeof v !== "number" || !isFinite(v)) return undefined;
    return Math.max(st.min, Math.min(st.max, v + delta * st.step));
}

function steppedTo(r, delta) {
    var v = r.values || [], n = v.length;
    if (!n) return undefined;
    return v[((r.index + delta) % n + n) % n];
}

function flipped(r) {
    var v = r.values || ["on", "off"];
    return r.on ? v[1] : v[0];
}

function categories(current) {
    var out = [];
    for (var i = 0; i < Menu.categories.length; i++) {
        var c = Menu.categories[i];
        out.push({ "variant": "category", "label": c.label, "icon": c.icon, "hue": i, "current": c.id === current, "category": c.id });
    }
    return out;
}
