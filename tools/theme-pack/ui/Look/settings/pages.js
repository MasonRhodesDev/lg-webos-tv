.pragma library
.import "catalog.js" as Catalog
.import "menu.js" as Menu

// The page framework: a page entry on the navigation stack becomes a header and a RowList model, from menu.js (the
// pages we design), catalog.js (every other page, drawn from its items) and the store's live state.
//
// An entry is { id } for a page, plus for generated pages:
//   { id: "pick:<ref>", ref, title, then }  a value picker: one choice row per value, OK chooses and goes back
//   { id: "adjust:<ref>", ref, title }      a range on its own page, as a slider row
// Each model row carries, beside its ListRow properties, what OK does: kind "item" (ref), "page" (entry), "action"
// (ref), "settings" (open all Settings), "choose" (ref, value), "style" (value), "theme" (value).

function words(id) { return Menu.words(id); }

function categoryOf(id) {
    for (var i = 0; i < Menu.categories.length; i++) if (Menu.categories[i].id === id) return Menu.categories[i];
    return null;
}
// The page at the top of one of our categories.
function topOf(category) { var c = categoryOf(category); return c ? c.page : Menu.categories[0].page; }

// Which of our categories a page belongs to.
function categoryFor(id) {
    var d = Menu.pages[id];
    if (d) return d.category;
    if (id.indexOf("pick:") === 0 || id.indexOf("adjust:") === 0) return "";
    var c = Catalog.catalog.pages[id];
    return c ? Menu.home[c.category] || Menu.categories[0].id : "";
}

function exists(id) { return !!(Menu.pages[id] || Catalog.catalog.pages[id]); }

// The stack of page ids that leads to a page: its category's top page, then LG's path to it.
function pathTo(id) {
    var cat = categoryFor(id), top = topOf(cat), c = Catalog.catalog.pages[id];
    var path = c ? c.lgPath.slice() : [id];
    if (path[0] !== top) path.unshift(top);
    var out = [];
    for (var i = 0; i < path.length; i++) if (exists(path[i]) && out.indexOf(path[i]) < 0) out.push(path[i]);
    return out;
}

// A target (SETTINGS-PLAN.md entry points): one of our categories, a page id, or one of LG's deep-link names.
// Returns the stack of page ids, or [] for the first page. Unknown names land on Picture, as LG's Settings does.
function target(name) {
    if (!name) return [];
    if (categoryOf(name)) return [categoryOf(name).page];
    if (exists(name)) return pathTo(name);
    var lg = Catalog.catalog.targets[name];
    if (lg) {
        for (var i = lg.length - 1; i >= 0; i--) if (exists(lg[i])) return pathTo(lg[i]);
    }
    return [Menu.categories[0].page];
}

// Catalog pages that sit under a page in LG's tree, including ones no row of it links to (LG's code opens them).
function children(id) {
    var out = [];
    for (var i = 0; i < Catalog.catalog.order.length; i++) {
        var p = Catalog.catalog.pages[Catalog.catalog.order[i]], n = p.lgPath.length;
        if (n > 1 && p.lgPath[n - 2] === id && !p.region) out.push(p);
    }
    return out;
}

// What a page is made of: { title, sub, rows: [specs] } (specs as in menu.js).
function definition(entry) {
    var id = entry.id, d = id === "quick" ? Menu.quick : Menu.pages[id];
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

// The designed rows, with each `more` expanded: the rest of the catalog page this page stands in for, or a link to a
// catalog category's top page.
function expanded(entry) {
    var d = definition(entry), out = [], used = {}, i, j;
    for (i = 0; i < d.rows.length; i++) {
        if (d.rows[i].item) used[d.rows[i].item] = true;
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

// Every item ref a page shows, for store.watch().
function refs(entry) {
    var out = [];
    if (entry.ref) out.push(entry.ref);
    if (entry.id === "Look") return out;
    var rows = expanded(entry).rows, d = definition(entry);
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].item) out.push(rows[i].item);
        if (rows[i].value) out.push(rows[i].value);
        if (rows[i].action) out.push(rows[i].action);
        if (rows[i].activeWhen) out.push(rows[i].activeWhen.ref);
    }
    if (d.sub && d.sub.from) out.push(d.sub.from);
    return out;
}

function subtitle(sub, store) {
    if (!sub) return "";
    if (typeof sub === "string") return sub;
    var label = store.state(sub.from).label;
    if (!label) return "";
    return sub.format ? sub.format.replace("%s", label) : label;
}

function title(entry) { return entry.title || expanded(entry).title; }

function isOn(st, spec) {
    var v = st.value;
    if (spec.as === "toggle") return v !== undefined && v !== spec.off;
    return v === "on" || v === true;
}

// One spec as a RowList row (or null when the TV hides it).
function row(spec, store, hue) {
    var r = { "label": spec.label, "icon": spec.icon || "", "hue": hue, "hint": spec.hint || "" };
    if (spec.section !== undefined) return { "section": spec.section };
    if (spec.settings) { r.variant = "nav"; r.kind = "settings"; return r; }
    if (spec.page) {
        r.variant = "nav";
        r.kind = "page";
        r.entry = { "id": spec.page };
        if (spec.value) r.value = store.state(spec.value).label;
        return r;
    }
    var ref = spec.item || spec.action, st = store.state(ref), it = st.item;
    if (!it || !st.visible) return null;
    r.ref = ref;
    r.spec = spec;
    var ok = st.active && store.holds(spec.activeWhen);
    if (!ok) { r.disabled = true; if (spec.why) r.hint = spec.why; }
    if (spec.action || it.type === "action") { r.variant = "action"; r.kind = "action"; return r; }
    r.kind = "item";
    if (spec.as === "toggle" || it.type === "switch") { r.variant = "toggle"; r.on = isOn(st, spec); return r; }
    if (it.type === "range") {
        var v = typeof st.value === "number" ? st.value : st.min;
        if (spec.as === "value") { r.variant = "value"; r.value = st.value === undefined ? "" : st.label; return r; }
        r.variant = "slider";
        r.fraction = st.max > st.min ? (v - st.min) / (st.max - st.min) : 0;
        r.valueText = st.value === undefined ? "" : st.label;
        return r;
    }
    if (it.type === "enum") { r.variant = "value"; r.value = st.label; return r; }
    if (it.type === "info") { r.variant = "info"; r.value = st.label; return r; }
    // Lists, forms and files have pages of their own, still to come; shown, and visibly not built yet.
    r.variant = "info";
    r.kind = "";
    r.disabled = true;
    r.hint = "Not in our Settings yet";
    return r;
}

function lookRows(store, Look) {
    var out = [{ "section": "Style" }], styles = Look.available.styles || [], themes = Look.available.themes || [], i;
    for (i = 0; i < styles.length; i++)
        out.push({ "variant": "choice", "label": styles[i].name, "icon": "palette", "hue": i, "kind": "style", "value": "",
                   "choice": styles[i].id, "checked": styles[i].id === Look.chosen.style, "current": styles[i].id === Look.chosen.style });
    out.push({ "section": "Themes" });
    var on = Look.chosen.themes || [];
    for (i = 0; i < themes.length; i++)
        out.push({ "variant": "toggle", "label": themes[i].name, "hint": themes[i].description || "", "icon": "sparkle",
                   "hue": styles.length + i, "kind": "theme", "choice": themes[i].id, "on": on.indexOf(themes[i].id) >= 0 });
    return out;
}

function pickerRows(entry, store) {
    var st = store.state(entry.ref), out = [], opts = st.options;
    for (var i = 0; i < opts.length; i++) {
        var cur = opts[i].value === st.value;
        out.push({ "variant": "choice", "label": opts[i].label, "icon": entry.icon || "", "hue": i, "hint": cur ? "Current" : "",
                   "checked": cur, "current": cur, "disabled": !opts[i].active, "kind": "choose", "ref": entry.ref, "choice": opts[i].value });
    }
    if (entry.then) {
        out.push({ "variant": "nav", "label": entry.then.label.replace("%s", st.label), "icon": entry.then.icon || "", "hue": out.length,
                   "kind": "page", "entry": { "id": entry.then.page } });
    }
    return out;
}

// The page's rows, for RowList's `rows`. Bind it to store.revision so values stay live.
function model(entry, store, Look) {
    if (entry.id === "Look") return lookRows(store, Look);
    if (entry.id.indexOf("pick:") === 0) return pickerRows(entry, store);
    if (entry.id.indexOf("adjust:") === 0) {
        var r = row({ "item": entry.ref, "label": entry.title, "icon": entry.icon }, store, 0);
        return r ? [r] : [];
    }
    var specs = expanded(entry).rows, out = [], n = 0;
    for (var i = 0; i < specs.length; i++) {
        var x = row(specs[i], store, specs[i].section !== undefined ? -1 : n % 7);
        if (!x) continue;
        if (x.section === undefined) n++;
        // A section with nothing under it is left out.
        if (x.section !== undefined && out.length && out[out.length - 1].section !== undefined) out.pop();
        out.push(x);
    }
    if (out.length && out[out.length - 1].section !== undefined) out.pop();
    return out;
}

// The confirmation an action asks for first (catalog `confirm`), or "".
function confirmation(r, store) {
    if (r.kind !== "action" || !r.ref) return "";
    var it = store.item(r.ref), c = it && it.confirm;
    return typeof c === "string" && c.indexOf("?") >= 0 ? c : "";
}

// The row a page should land on: the chosen value on a picker, a given ref, or the first that takes focus.
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

// What OK on a value row opens: its picker, or for a range shown as a value, its adjust page.
function drill(r, crumb) {
    var it = r.spec || {};
    if (r.variant === "value" && it.as === "value")
        return { "id": "adjust:" + r.ref, "ref": r.ref, "title": r.label, "icon": r.icon, "crumb": crumb };
    return { "id": "pick:" + r.ref, "ref": r.ref, "title": r.label, "icon": r.icon, "then": it.then, "crumb": crumb };
}

// A slider row's next value after Left/Right.
function stepped(store, ref, delta) {
    var st = store.state(ref), v = typeof st.value === "number" ? st.value : st.min;
    return Math.max(st.min, Math.min(st.max, v + delta * st.step));
}

// The value a toggle row writes when flipped.
function flipped(r) {
    var spec = r.spec || {};
    if (spec.as === "toggle") return r.on ? spec.off : spec.on;
    return r.on ? "off" : "on";
}

// The category list down the left.
function categories(current) {
    var out = [];
    for (var i = 0; i < Menu.categories.length; i++) {
        var c = Menu.categories[i];
        out.push({ "variant": "category", "label": c.label, "icon": c.icon, "hue": i, "current": c.id === current, "category": c.id });
    }
    return out;
}
