"""Collect per-element facts from the extracted trees. Usage: python3 -I collect.py GUI_DIR OUT_JSON"""
import json, os, re, sys, subprocess

G = sys.argv[1]
OUT = sys.argv[2]
ROOT = os.path.join(G, "rootfs")
HBC = os.path.join(G, "x/media_developer/media/developer/apps/usr/palm")
LS2 = os.path.join(ROOT, "usr/share/luna-service2")
LEG = os.path.join(ROOT, "usr/share/ls2/roles")

ELEMENTS = {
    "home": {"paths": ["usr/palm/applications/com.webos.app.home"], "names": ["com.webos.app.home"]},
    "fullhome": {"paths": ["usr/palm/applications/com.webos.app.fullhome"], "names": ["com.webos.app.fullhome"]},
    "inputcommon": {"paths": ["usr/palm/applications/com.webos.app.inputcommon"], "names": ["com.webos.app.inputcommon", "com.webos.app.hdmi2"]},
    "inputpicker": {"paths": ["usr/lib/qt5/qml/InputPicker"], "names": []},
    "quicksettings": {"paths": ["usr/lib/qt5/qml/QuickSettings"], "names": []},
    "settings": {"paths": ["usr/palm/applications/com.palm.app.settings"], "names": ["com.palm.app.settings"]},
    "notification": {"paths": ["usr/lib/qt5/qml/SystemUI"], "names": ["com.webos.notification"]},
    "notificationcenter": {"paths": ["usr/palm/applications/com.webos.app.notificationcenter"], "names": ["com.webos.app.notificationcenter"]},
    "volume": {"paths": ["usr/lib/qt5/qml/YSM/Volume.qml", "usr/lib/qt5/qml/YSM/VolumeMute.qml"], "names": ["com.webos.surfacemanager"]},
    "tvhotkey": {"paths": ["usr/palm/applications/com.webos.app.tvhotkey"], "names": ["com.webos.app.tvhotkey"]},
    "livemenu": {"paths": ["usr/palm/applications/com.webos.app.livemenu"], "names": ["com.webos.app.livemenu"]},
    "airplay": {"paths": ["usr/palm/applications/airplay"], "names": ["airplay", "airplay.service"]},
    "assistant": {"paths": ["usr/palm/applications/com.webos.app.googleassistant"], "names": ["com.webos.app.googleassistant"]},
    "keyboard": {"paths": ["usr/lib/maliit/plugins", "usr/lib/qt5/qml/YSM/PopUps/Keyboard.qml"], "names": ["com.webos.service.ime"]},
    "screensaver": {"paths": ["usr/palm/applications/com.webos.app.screensaver", "usr/lib/qt5/qml/YSM/ScreenSaver"], "names": ["com.webos.app.screensaver"]},
}

LUNA = re.compile(r"(?:luna|palm)://([A-Za-z0-9_.\-]+)(/[A-Za-z0-9_/\-]*)?")
SVC = re.compile(r"""service\s*:\s*["']((?:luna|palm)://[^"']+)["']""")
TEXT_EXT = (".qml", ".js", ".json", ".html", ".css")


def walk(p):
    full = os.path.join(ROOT, p)
    if os.path.isfile(full):
        yield full
        return
    for d, _, fs in os.walk(full):
        for f in fs:
            yield os.path.join(d, f)


def size_of(p):
    tot = n = 0
    for f in walk(p):
        if os.path.islink(f):
            continue
        tot += os.path.getsize(f)
        n += 1
    return tot, n


SVCPROP = re.compile(r"""["']?(?:_service|service|serviceName)["']?\s*:\s*["'](?:(?:luna|palm)://)?([A-Za-z][A-Za-z0-9_.\-]+?)/?["']""")
SVCPROP2 = re.compile(r"""property\s+string\s+_?service\w*\s*:\s*["'](?:(?:luna|palm)://)?([A-Za-z][A-Za-z0-9_.\-]+?)/?["']""")
METH = re.compile(r"""\bmethod["']?\s*:\s*["']([A-Za-z0-9_/]+)["']""")
JSPAIR = re.compile(r"""["']?service["']?\s*:\s*["'](?:(?:luna|palm)://)?([A-Za-z][A-Za-z0-9_.\-]+?)/?["']\s*,\s*["']?method["']?\s*:\s*["']([A-Za-z0-9_/]+)["']""")


def svc_methods(p):
    """service -> {method -> [files]} from QML Service{} blocks (file-level pairing) and JS {service,method} literals."""
    res = {}
    for f in walk(p):
        if not f.endswith((".qml", ".js")) or "/resources/" in f or "/node_modules/" in f:
            continue
        s = open(f, encoding="utf-8", errors="replace").read()
        rel = os.path.relpath(f, ROOT)
        if f.endswith(".qml"):
            svcs = set(SVCPROP.findall(s)) | set(SVCPROP2.findall(s))
            svcs = {x for x in svcs if x.count(".") >= 2}
            meths = set(METH.findall(s))
            if len(svcs) == 1 and meths:
                sv = svcs.pop()
                for m in meths:
                    res.setdefault(sv, {}).setdefault(m, set()).add(rel)
            else:
                for sv in svcs:
                    res.setdefault(sv, {}).setdefault("?", set()).add(rel)
        for sv, m in JSPAIR.findall(s):
            res.setdefault(sv, {}).setdefault(m, set()).add(rel)
    return {k: {m: sorted(v)[:2] for m, v in sorted(d.items())} for k, d in sorted(res.items())}


def luna_calls(p):
    found = {}
    for f in walk(p):
        if not f.endswith(TEXT_EXT) or "/resources/" in f or "/node_modules/" in f:
            continue
        try:
            s = open(f, encoding="utf-8", errors="replace").read()
        except Exception:
            continue
        for m in LUNA.finditer(s):
            uri = m.group(1) + (m.group(2) or "")
            rel = os.path.relpath(f, ROOT)
            found.setdefault(uri, set()).add(rel)
    return {k: sorted(v)[:3] for k, v in sorted(found.items())}


def load(path):
    try:
        return json.load(open(path))
    except Exception:
        return None


def acl_for(name):
    res = {}
    for sub in ("roles.d", "client-permissions.d", "api-permissions.d", "manifests.d", "services.d", "groups.d"):
        d = os.path.join(LS2, sub)
        for f in sorted(os.listdir(d)):
            if f.startswith(name + ".") or f == name + ".json" or f.startswith(name + "-"):
                full = os.path.join(d, f)
                txt = open(full, errors="replace").read()
                res["usr/share/luna-service2/%s/%s" % (sub, f)] = txt[:4000]
    for sub in ("pub", "prv"):
        f = os.path.join(LEG, sub, name + ".json")
        if os.path.exists(f):
            res["usr/share/ls2/roles/%s/%s.json" % (sub, name)] = open(f).read()[:4000]
    return res


out = {}
for key, spec in ELEMENTS.items():
    e = {"paths": {}, "luna": {}, "acl": {}}
    for p in spec["paths"]:
        tot, n = size_of(p)
        e["paths"][p] = {"bytes": tot, "files": n}
        e["luna"].update(luna_calls(p))
        for k2, v2 in svc_methods(p).items():
            e.setdefault("svc", {}).setdefault(k2, {}).update(v2)
    for nm in spec["names"]:
        e["acl"].update(acl_for(nm))
    ai = os.path.join(ROOT, spec["paths"][0], "appinfo.json")
    if os.path.exists(ai):
        e["appinfo"] = load(ai)
    out[key] = e

# HBC
hb = {"paths": {}, "luna": {}}
for sub in ("applications/org.webosbrew.hbchannel", "services/org.webosbrew.hbchannel.service"):
    full = os.path.join(HBC, sub)
    tot = n = 0
    for d, _, fs in os.walk(full):
        for f in fs:
            fp = os.path.join(d, f)
            if not os.path.islink(fp):
                tot += os.path.getsize(fp); n += 1
            if fp.endswith(TEXT_EXT) and "/node_modules/" not in fp:
                s = open(fp, errors="replace").read()
                for m in LUNA.finditer(s):
                    uri = m.group(1) + (m.group(2) or "")
                    hb["luna"].setdefault(uri, set()).add(os.path.relpath(fp, HBC))
    hb["paths"]["media/developer/apps/usr/palm/" + sub] = {"bytes": tot, "files": n}
hb["luna"] = {k: sorted(v)[:3] for k, v in sorted(hb["luna"].items())}
hb["appinfo"] = load(os.path.join(HBC, "applications/org.webosbrew.hbchannel/appinfo.json"))
out["homebrew"] = hb

json.dump(out, open(OUT, "w"), indent=1, sort_keys=True)
for k, v in out.items():
    print(k, {p: (round(x["bytes"] / 1024), x["files"]) for p, x in v["paths"].items()}, "luna:", len(v["luna"]), "acl:", len(v.get("acl", {})))
