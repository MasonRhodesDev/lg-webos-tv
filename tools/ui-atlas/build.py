"""Assemble OUT_DIR/index.html.

python3 -I build.py WORK_DIR OUT_DIR

Reads WORK_DIR/facts.json (collect.py) and WORK_DIR/srcdoc.json (prep_srcdoc.py),
and page.css / page.js from this script's directory. Optional:
WORK_DIR/shots/manifest.json lists real screenshots already copied to OUT_DIR/img/shots/.
"""
import sys, os, json, html

W, OUT_DIR = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
F = json.load(open(os.path.join(W, "facts.json")))
SD = json.load(open(os.path.join(W, "srcdoc.json")))
OUT = os.path.join(OUT_DIR, "index.html")
_SM = os.path.join(W, "shots", "manifest.json")
SHOTS = json.load(open(_SM, encoding="utf-8")) if os.path.exists(_SM) else {"captured": None, "shots": {}}
# slot ids a screenshot manifest may use; each sits next to the matching reconstruction
SHOT_SLOTS = ("home", "hdmi-banner", "input-picker", "quick-settings", "toast", "volume", "hotkey", "live-menu", "keyboard")
esc = html.escape


def src(p):
    return '<span class="src">' + esc(p) + "</span>"


def code(s):
    return "<code>" + esc(s) + "</code>"


def kb(n):
    return f"{n/1024:,.0f} KB" if n < 1048576 else f"{n/1048576:,.1f} MB"


BADGE = {
    "web": ("web", "b-web"), "qml": ("qml", "b-qml"), "native": ("native Qt", "b-native"),
    "comp": ("in compositor", "b-comp"), "daemon": ("daemon", "b-daemon"), "preload": ("preloaded", "b-pre"),
    "criu": ("CRIU", "b-criu"), "boot": ("boot app", "b-boot"), "keep": ("KeepOnLaunchEx", "b-keep"),
    "dev": ("dev app", "b-dev"),
}
RLABEL = {"real": ("Real markup", "r-real"), "recon": ("Reconstruction from assets", "r-recon"),
          "schem": ("Schematic", "r-schem")}
if SHOTS["captured"]:
    RLABEL["shot"] = (f'Screenshot (captured {SHOTS["captured"]})', "r-shot")


def badges(keys):
    return "".join(f'<span class="badge {BADGE[k][1]}">{BADGE[k][0]}</span>' for k in keys)


def rl(k):
    t, c = RLABEL[k]
    return f'<span class="rlabel {c}">{t}</span>'


def tv(inner, label, caption, iframe=None, title=""):
    if iframe is not None:
        stage = (f'<iframe class="stage" sandbox="allow-same-origin" loading="lazy" width="1920" height="1080" '
                 f'title="{esc(title)}" srcdoc="{esc(iframe, quote=True)}"></iframe>')
    else:
        stage = f'<div class="stage" role="img" aria-label="{esc(title)}">{inner}</div>'
    return (f'<figure class="render"><div class="tv">{stage}</div>'
            f'<figcaption>{rl(label)}<span>{caption}</span></figcaption></figure>')


def shot(slot):
    """Real compositor capture for this slot, or "" when the build has none."""
    assert slot in SHOT_SLOTS, slot
    s = SHOTS["shots"].get(slot)
    if not s:
        return ""
    return (f'<figure class="render"><div class="tv"><img class="shot" src="{esc(s["src"])}" alt="{esc(s["alt"])}" '
            f'width="1920" height="1080" loading="lazy" decoding="async"></div>'
            f'<figcaption>{rl("shot")}<span>{s["caption"]}</span></figcaption></figure>')


def paired(*figs):
    figs = [f for f in figs if f]
    return figs[0] if len(figs) == 1 else '<div class="pair">' + "".join(figs) + "</div>"


def table(head, rows, cls=""):
    h = "".join(f"<th>{x}</th>" for x in head)
    b = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="scroll"><table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def part(path):
    p = path
    if p.startswith("/media/developer") or p.startswith("/media/cryptofs"):
        return "p53 · ext4 rw (<code>/media</code>)"
    if p.startswith("/mnt/otncabi"):
        return "p31 otncabi · squashfs ro"
    if p.startswith("/mnt/lg/cmn_data") or p.startswith("/var"):
        return "p52 · ext4 rw"
    if p.startswith("/tmp"):
        return "tmpfs (RAM)"
    return "p28 rootfs · squashfs ro"


def store_rows(items):
    rows = []
    for path, note in items:
        rows.append([code(path), part(path), note])
    return table(["Path", "Partition / fs", "What"], rows, "store")


APPINFO_KEYS = ["id", "type", "main", "visible", "supportQuickStart", "keepAlive", "defaultWindowType", "transparent",
                "noSplashOnLaunch", "handlesRelaunch", "usePrerendering", "v8SnapshotFile", "trustLevel",
                "nativeLifeCycleInterfaceVersion", "bootLaunchParams", "params", "deeplinkingParams",
                "privilegedJail", "requiredEULA", "enableBackgroundRun", "requiredPermissions", "inAppSetting",
                "windowGroup", "useCORSWhitelist", "previewMetadata", "uiRevision", "version"]


def appinfo(key, path):
    ai = F[key].get("appinfo") or {}
    rows = []
    for k in APPINFO_KEYS:
        if k == "keepAlive":
            v = ai.get(k, None)
            rows.append([code(k), '<span class="muted">not set</span>' if v is None else code(json.dumps(v))])
            continue
        if k == "supportQuickStart" and k not in ai:
            rows.append([code(k), '<span class="muted">not set</span>'])
            continue
        if k in ai:
            v = json.dumps(ai[k])
            if k == "windowGroup":
                v = "layers: " + ", ".join(f'{l["name"]} z{l["z"]}' for l in ai[k]["ownerInfo"]["layers"])
                rows.append([code(k), esc(v)])
                continue
            rows.append([code(k), code(v if len(v) < 140 else v[:137] + "…")])
    return (f'<p class="cap">appinfo.json fields {src(path)}</p>' + table(["Field", "Value"], rows, "kv"))


def sizes(key):
    rows = []
    for p, x in F[key]["paths"].items():
        pp = "/" + p
        rows.append([code(pp), part(pp), f'<span class="num">{kb(x["bytes"])}</span>', f'<span class="num">{x["files"]}</span>'])
    return table(["Bundle", "Partition / fs", "Size", "Files"], rows, "store")


def calls(key, limit=16, prefer=None):
    svc = F[key].get("svc", {})
    luna = F[key].get("luna", {})
    rows = []
    items = sorted(svc.items(), key=lambda kv: -len([m for m in kv[1] if m != "?"]))
    if prefer:
        items = sorted(items, key=lambda kv: (0 if kv[0] in prefer else 1, -len(kv[1])))
    for s, ms in items[:limit]:
        meth = sorted(m for m in ms if m != "?")
        first = next(iter(ms.values()))[0]
        rows.append([code(s), ", ".join(code(m) for m in meth[:6]) + (f' <span class="muted">+{len(meth)-6}</span>' if len(meth) > 6 else "")
                     or '<span class="muted">(dynamic)</span>', src(first)])
    if not rows:
        for u, fs in list(luna.items())[:limit]:
            rows.append([code("luna://" + u), "", src(fs[0])])
    more = len(svc) - limit
    t = table(["Service", "Methods called", "First seen in"], rows, "calls")
    if more > 0:
        t += f'<p class="cap">{more} more services in the bundle; list generated by grepping <code>service:</code>/<code>method:</code> pairs in QML/JS.</p>'
    return t


def section(title, body, cls=""):
    return f'<section class="block {cls}"><h3>{title}</h3>{body}</section>'


# ------------------------------------------------------------------ reconstructions (1920x1080 stage HTML)
VID = '<div class="vid"><span>HDMI 2 picture (placeholder)</span></div>'


def home_stage():
    lps = [("Home Dashboard", "#ffffff", "img/lp-homeconnect.png", True), ("Netflix", "#ffffff", None, False),
           ("Emby", "#333333", None, False), ("Plex", "#1f1f1f", None, False), ("Twitch", "#9146ff", None, False),
           ("YouTube", "#ffffff", None, False), ("Prime Video", "#1a98ff", None, False), ("GALLERY", "#139380", "img/lp-igallery.png", False),
           ("Photo &amp; Video", "#7c20d5", "img/lp-photovideo.png", False), ("Music", "#7d53d3", "img/lp-music.png", False),
           ("LG Content Store", "#d7156d", "img/lp-discovery.png", False), ("Homebrew Channel", "#cf0652", "img/lp-hbchannel.png", False)]
    x = 20
    tiles = []
    for i, (t, c, ic, focus) in enumerate(lps):
        w = 140
        inner = f'<img src="{ic}" alt="" style="width:{96 if "hbchannel" not in (ic or "") else 80}px">' if ic else f'<b>{t}</b>'
        dark = c.lower() in ("#ffffff",)
        cls = "tile" + (" focus" if focus else "")
        tiles.append(f'<div class="{cls}" style="left:{x}px;width:{w}px;background:{c};color:{"#222" if dark else "#fff"}">{inner}</div>')
        x += w + 10
    return (VID + '<div class="home-ribbon">' + "".join(tiles) +
            '<div class="home-title" style="left:20px">Home Dashboard</div></div>')


def hdmi_stage():
    return (VID + '<div class="banner"><img class="bl" src="img/ban-l.png" alt=""><div class="bm"><img src="img/in-hdmi2.png" alt="" class="bi">'
            '<span class="bt">HDMI 2</span></div><img class="br" src="img/ban-r.png" alt=""></div>')


def picker_stage():
    tiles = [("Home Dashboard", "img/ip-homedashboard.png", "title"), ("HDMI 1", "img/in-hdmi1.png", ""),
             ("HDMI 2", "img/in-hdmi2.png", "sel"), ("HDMI 3", "img/in-hdmi3.png", ""), ("HDMI 4", "img/in-hdmi4.png", ""),
             ("AV", "img/in-av.png", "")]
    x, out = 40, []
    for t, ic, k in tiles:
        w = 280 if k == "title" else 300
        cls = "ip-tile" + (" act" if k == "sel" else "")
        chk = '<img class="ip-chk" src="img/ip-check.png" alt="">' if k == "sel" else ""
        out.append(f'<div class="{cls}" style="left:{x}px;width:{w}px"><img class="ip-ic" src="{ic}" alt="">'
                   f'<span class="ip-t">{t}</span>{chk}</div>')
        x += w + 10
        if k == "title":
            out.append(f'<div class="ip-sep" style="left:{x + 30}px"></div>')
            x += 63
    return (VID + '<div class="ip-bg"></div><div class="ip-cat" style="left:403px">Inputs</div>' + "".join(out))


def qs_stage():
    items = [("picture", "Picture Mode", "Eco"), ("aspect_ratio", "Aspect Ratio", ""), ("soundmode", "Sound Mode", "Standard"),
             ("surround", "Sound Effect", ""), ("sound", "Sound Out", "TV Speaker"), ("sleep", "Sleep Timer", ""),
             ("network", "Network", ""), ("allsettings", "All Settings", "")]
    y, out = 52, []
    for i, (ic, cap, sub) in enumerate(items):
        foc = " qs-focus" if i == 0 else ""
        out.append(f'<div class="qs-item{foc}" style="top:{y}px"><div class="qs-btn"><img src="img/qs-{ic}.png" alt=""></div>'
                   f'<div class="qs-cap">{cap}' + (f'<small>{sub}</small>' if sub else "") + '</div></div>')
        y += 106
    return (VID + '<div class="qs-grad"></div><div class="qs-close"><img src="img/qs-close.png" alt=""></div>' + "".join(out))


def toast_stage():
    return (VID + '<div class="toast"><div class="toast-ic"><img src="img/lp-hbchannel.png" alt=""></div>'
            '<div class="toast-tx"><b>Failsafe mode!</b><br>A crash has occured during startup. Fix any causes and reboot.</div></div>')


def volume_stage():
    return (VID + '<img class="vol-mask" src="img/ysm-volume_mask.png" alt="">'
            '<div class="vol"><img class="vol-ic" src="img/ysm-volume_icon.png" alt="">'
            '<img class="vol-n" src="img/ysm-volume_num_1.png" alt=""><img class="vol-n" src="img/ysm-volume_num_2.png" alt="">'
            '<div class="vol-bar"><img class="vol-up" src="img/ysm-volume_up.png" alt=""><div class="vol-fill" style="height:12%"></div>'
            '<img class="vol-dn" src="img/ysm-volume_down.png" alt=""></div></div>')


def hotkey_stage():
    modes = ["Vivid", "Standard", "Eco", "Cinema", "Sports", "Game", "Expert1", "Expert2"]
    rows = "".join(f'<div class="hk-row{" hk-f" if m == "Eco" else ""}"><img src="img/hk-radio-{"f" if m == "Eco" else "n"}.png" alt="">{m}</div>' for m in modes)
    return (VID + '<div class="hk"><img class="hk-ti" src="img/hk-picturemode.png" alt=""><div class="hk-title">Picture Mode</div>'
            '<img class="hk-x" src="img/hk-close.png" alt=""><div class="hk-div"></div>' + rows + '</div>')


def livemenu_stage():
    tabs = ["recommend", "channels", "tvguide", "tvscheduler", "recordings"]
    t = "".join(f'<div class="lm-tab{" on" if x == "channels" else ""}"><img src="img/lm-{x}{"-s" if x == "channels" else ""}.png" alt=""></div>' for x in tabs)
    return (VID + '<div class="lm"><div class="lm-tabs">' + t + '</div><div class="lm-panel"><div class="lm-h">CHANNELS</div>'
            '<div class="lm-rule"></div><div class="lm-empty">Channel list area. Rows are filled at runtime from '
            '<code>com.webos.service.iepg</code> and <code>tv.channel</code>; not reconstructed.</div></div></div>')


def keyboard_stage():
    rows = ["1234567890", "qwertyuiop", "asdfghjkl'", "zxcvbnm,.?"]
    keys = []
    y = 20
    for r in rows:
        x = 20 + 174 + 20
        for ch in r:
            foc = " kfocus" if ch == "g" else ""
            keys.append(f'<div class="key{foc}" style="left:{x}px;top:{y}px">{esc(ch)}</div>')
            x += 141 + 6
        y += 58
    left = [("English", 20), ("!#1", 78), ("Àà", 136), ("1/2", 194)]
    for t, yy in left:
        keys.append(f'<div class="key fn" style="left:20px;top:{yy}px;width:174px">{t}</div>')
    right = [("&lt;", 20, 93), ("&gt;", 20 + 99, 93)]
    rx = 1920 - 20 - 192
    keys.append(f'<div class="key fn" style="left:{rx}px;top:20px;width:93px">&lt;</div>')
    keys.append(f'<div class="key fn" style="left:{rx+99}px;top:20px;width:93px">&gt;</div>')
    keys.append(f'<div class="key fn" style="left:{rx}px;top:78px;width:192px;height:110px">Clear all</div>')
    keys.append(f'<div class="key fn" style="left:{rx}px;top:194px;width:192px">Enter</div>')
    keys.append('<div class="key fn" style="left:20px;top:252px;width:174px"><img src="img/kb-shift.png" alt=""></div>')
    keys.append('<div class="key fn" style="left:214px;top:252px;width:1180px"><img src="img/kb-spacebar.png" alt=""></div>')
    keys.append('<div class="key fn" style="left:1400px;top:252px;width:147px"><img src="img/kb-move-left.png" alt=""></div>')
    keys.append('<div class="key fn" style="left:1553px;top:252px;width:147px"><img src="img/kb-move-right.png" alt=""></div>')
    keys.append('<div class="key fn" style="left:1728px;top:252px;width:172px">Hide</div>')
    return VID + '<div class="field">Search<span class="caret"></span></div><div class="kb">' + "".join(keys) + "</div>"


def screensaver_stage():
    return ('<canvas class="ss-canvas" width="1920" height="1080" aria-hidden="true"></canvas>'
            '<div class="ss-text">To turn the screen back on, please press any button except for the power button.</div>')


def airplay_stage():
    return '''<div class="schem">
<svg viewBox="0 0 1920 1080" width="1920" height="1080" aria-hidden="true">
<defs><marker id="ah" markerWidth="16" markerHeight="16" refX="12" refY="8" orient="auto"><path d="M0,0 L16,8 L0,16 z" fill="#9fb3c2"/></marker></defs>
<g font-family="JetBrains Mono, monospace" font-size="30" fill="#dfe8ee">
<rect x="80" y="160" width="380" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="110" y="225">Apple device</text><text x="110" y="270" fill="#9fb3c2" font-size="24">AirPlay sender</text>
<rect x="620" y="160" width="520" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="650" y="225">/usr/sbin/airplay</text><text x="650" y="270" fill="#9fb3c2" font-size="24">ls-hubd on-demand · airplay.service</text>
<rect x="1300" y="160" width="540" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="1330" y="225">libairplay-webengine</text><text x="1330" y="270" fill="#9fb3c2" font-size="24">launchAirplayApp[Preloaded]</text>
<rect x="1300" y="470" width="540" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="1330" y="535">SAM → WebAppMgr</text><text x="1330" y="580" fill="#9fb3c2" font-size="24">app "airplay", window type card</text>
<rect x="620" y="470" width="520" height="150" rx="6" fill="#2a2216" stroke="#a07a3c" stroke-width="3"/><text x="650" y="535">launch.html</text><text x="650" y="580" fill="#d9b67a" font-size="24">window.location = contentTarget</text>
<rect x="80" y="470" width="380" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="110" y="535">player page</text><text x="110" y="580" fill="#9fb3c2" font-size="24">MSE, CORS whitelist</text>
<rect x="620" y="780" width="520" height="150" rx="6" fill="#1d2a33" stroke="#4d6577" stroke-width="3"/><text x="650" y="845">/usr/sbin/homekit</text><text x="650" y="890" fill="#9fb3c2" font-size="24">airplay.homekit (pairing)</text>
<path d="M460 235 H610" stroke="#9fb3c2" stroke-width="4" marker-end="url(#ah)"/><path d="M1140 235 H1290" stroke="#9fb3c2" stroke-width="4" marker-end="url(#ah)"/>
<path d="M1570 310 V460" stroke="#9fb3c2" stroke-width="4" marker-end="url(#ah)"/><path d="M1300 545 H1150" stroke="#9fb3c2" stroke-width="4" marker-end="url(#ah)"/>
<path d="M620 545 H470" stroke="#9fb3c2" stroke-width="4" marker-end="url(#ah)"/><path d="M1140 855 H1215 V285 H1145" stroke="#9fb3c2" stroke-width="3" stroke-dasharray="10 10" fill="none"/>
<text x="80" y="1000" fill="#9fb3c2" font-size="26">No static UI ships in the bundle: launch.html only forwards</text><text x="80" y="1040" fill="#9fb3c2" font-size="26">to the URL the AirPlay daemon passes as contentTarget.</text>
</g></svg></div>'''


# ------------------------------------------------------------------ element tabs
TABS = []


def add(id_, short, name, ident, bkeys, body):
    TABS.append((id_, short, name, ident, bkeys, body))


def proc(rows):
    return table(["Process", "PID boot 1", "PID boot 2", "Started by"], rows, "proc")


# HOME ---------------------------------------------------------------------------------
add("home", "Home", "Home launcher", "com.webos.app.home", ["native", "boot", "criu", "keep", "preload"],
    paired(tv(home_stage(), "recon", "Ribbon tile geometry from <code>GlobalStyle.qml</code> (140&times;252 tiles, 10 px gap, 9.462&deg; slant, focus <code>#cf0652</code>); tile order and colours from <code>listLaunchPoints</code>. Third-party icons live on <code>/media/cryptofs</code>, which is not in the backup, so those tiles show their title on their real <code>iconColor</code>.", title="Home launcher ribbon reconstruction"), shot("home"))
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("home") + store_rows([
                  ("/usr/bin/com.webos.app.home", "39 KB Qt launcher; strings show it loads <code>/usr/palm/applications/com.webos.app.home/qml/main.qml</code> and links <code>libsnapshot-boot.so.1</code> (<code>AppSnapshotManager</code>)"),
                  ("/usr/palm/applications/com.webos.app.home/qml/", "125 QML files: <code>Containers/</code>, <code>Controllers/LaunchPointInterfaces</code>, <code>AppInitializer/GlobalStyle.qml</code>"),
                  ("/mnt/lg/cmn_data/checkpoint/com.webos.app.home/", "CRIU image set, 27 files, 11.3 MB, dated 2024-07-25 (made in the snapshot-making boot)"),
                  ("/usr/palm/applications/com.webos.app.fullhome/", "the second launcher (full-screen Home Dashboard), 21 MB, same pattern")])
              + appinfo("home", "p28:/usr/palm/applications/com.webos.app.home/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li>The kernel resumes the whole-system snapshot from the hib partition p48 ' + src("docs/recovery.md") + '; SAM&rsquo;s own launch of home is <em>inside</em> that image: '
              + code('NL_APP_LAUNCH_BEGIN {"app_id":"com.webos.app.home","caller_id":"com.webos.lunasend-1705"}') + ' at monotonic 5.10 s, identical in both boots ' + src("boot{1,2}/runtime/var_log.tar:messages") + "</li>"
              "<li><code>sam-conf-tv.json</code> lists it in <code>BootTimeApps</code> and <code>CRIUSupportApps</code>; memorymanager keeps it via <code>KeepOnLaunchEx</code> " + src("p28:/etc/palm/sam-conf-tv.json, /etc/palm/memorymanager-conf.json") + "</li>"
              "<li>SAM (PID 1685) execs the native binary with <code>{\"parameters\":{\"snapshot\":true},\"preload\":\"full\",\"@system_native_app\":true}</code> " + src("boot1/runtime/ps.txt") + "</li>"
              "<li>Preload policy: <code>preloadMode criu</code>, <code>periodic</code>, priority 1, 40 MB, <code>extPolicy full/50 MB</code> " + src("boot1/settings/preloadPolicy.json") + "</li>"
              "<li>Surfaces go to surface-manager as window type <code>home</code>; YSM&rsquo;s <code>Home/HomeSurface.qml</code> and <code>HomeUIStateMgr.qml</code> position the ribbon.</li></ol>"
              + proc([[code("com.webos.app.home"), '<span class="num">1734</span>', '<span class="num">1734</span>', "sam (1685)"],
                      [code("com.webos.app.fullhome"), "not running", "not running", "CRIU image only"]])
              + '<p class="note">Same PID 1734 in both boots because all of userspace up to that point (ls-hubd 1477, surface-manager 1584, sam 1685, home 1734, inputcommon 1746) comes back from the p48 system snapshot; later daemons such as bootd and WebAppMgr get new PIDs. The per-app CRIU images in <code>cmn_data/checkpoint</code> (here <code>fs-1734.img</code>) serve relaunches, not boot. RSS 63.9 MB / PSS 37.9 MB / swap 3.7 MB ' + src("docs/background-apps.md") + "; the runtime snapshot has no RSS column.</p>")
    + section("Interfaces",
              '<p>Exposes bus name <code>com.webos.app.home</code>; role is <code>privileged</code> with <code>inbound ["*"]</code> and <code>outbound ["*"]</code>, so ACG does not limit what it calls ' + src("p28:/usr/share/ls2/roles/prv/com.webos.app.home.json") + ". Activated on demand through " + src("p28:/usr/share/dbus-1/system-services/com.webos.app.home.service") + ".</p>"
              + calls("home", 14, prefer=["com.webos.applicationManager", "com.webos.settingsservice", "com.palm.db"])
              + "<p>Settings it watches include <code>homePromotion</code> and <code>general.personalRecommend</code> (both <code>off</code> on this TV) " + src("docs/startup.md") + ". Launch params: <code>snapshot</code>, <code>preload</code>.</p>")
    + section("Notes",
              "<ul><li><code>type: \"native\"</code> in appinfo, but everything visible is QML. The binary is a thin Qt host plus CRIU hooks.</li>"
              "<li><code>com.webos.app.fullhome</code> is listed in <code>BootTimeApps</code> but is not running in either snapshot; it exists only as a checkpoint image (20.4 MB).</li>"
              "<li>Admanager, sdx and iotclient appear in the call list: the launcher is also an ad and recommendations surface.</li>"
              "<li>Open: whether the ribbon order comes from <code>com.webos.applicationManager.ordering:1</code> in db8 or from the launch-point list order shown here.</li></ul>")
    + "</div>")

# HDMI -----------------------------------------------------------------------------------
add("hdmi-input", "HDMI input", "HDMI / external input app", "com.webos.app.inputcommon · hdmi1–4", ["native", "boot", "criu", "preload"],
    paired(tv(hdmi_stage(), "recon", "Input banner from <code>TvComponent/Banner/InputBanner/SimpleBanner.qml</code>: 140 px slanted black banner built from three PNG slices, label in Miso, banner top at 640 px. The real banner sits over live HDMI video.", title="HDMI input banner reconstruction"), shot("hdmi-banner"))
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("inputcommon") + store_rows([
                  ("/usr/bin/com.webos.app.inputcommon", "94 KB Qt host shared by every input app"),
                  ("/usr/palm/applications/com.webos.app.hdmi2/appinfo.json", "alias app: <code>main</code> points at the inputcommon binary"),
                  ("/usr/palm/plugins/inputapps/assets/", "input icons (<code>small/</code> 60 px, <code>medium/</code> 130 px)"),
                  ("/mnt/lg/cmn_data/checkpoint/com.webos.app.inputcommon/", "CRIU image set, 25.7 MB")])
              + appinfo("inputcommon", "p28:/usr/palm/applications/com.webos.app.inputcommon/appinfo.json")
              + '<p class="cap">hdmi2 differs from inputcommon by <code>bootLaunchParams {"boot":true}</code>, a <code>windowGroup</code> owner with layers layer1 z1, acrLayer z2, zoomLayer z3, hbbtvLayer z4, layer2 z5, and <code>miniicon</code> ' + src("p28:/usr/palm/applications/com.webos.app.hdmi2/appinfo.json") + "</p>")
    + section("How it loads",
              '<ol class="chain"><li>Baked into the system snapshot like home (monotonic 5.14 s, caller <code>com.webos.lunasend-1710</code>).</li>'
              "<li>bootd <code>doFirstAppLaunching</code> right after <code>core-boot-done</code>: calls <code>luna://com.webos.applicationManager/launch</code> with "
              + code('{"id":"com.webos.app.inputcommon","noSplash":true,"params":{"boot":true,...}}') + " " + src("boot{1,2}/runtime/bootd.log") + "</li>"
              "<li>SAM resolves the last input and shows <code>com.webos.app.hdmi2</code>; LSM logs <code>screen_state FULLSCREEN</code>.</li>"
              "<li>Switching to another input restores a second process from the CRIU image: boot 2 has PID 1747 next to 1746, and <code>com.webos.app.inputcommon_criu_restore.log</code> ends &ldquo;Restore finished successfully&rdquo; " + src("boot2/runtime/var_log.tar") + "</li></ol>"
              + table(["Event", "Boot 1 (s)", "Boot 2 (s)"], [
                  ["BOOTD_START", '<span class="num">14.48</span>', '<span class="num">14.45</span>'],
                  ["core-boot-done", '<span class="num">15.66</span>', '<span class="num">15.78</span>'],
                  ["launch inputcommon requested", '<span class="num">15.69</span>', '<span class="num">15.86</span>'],
                  ["launch success", '<span class="num">16.15</span>', '<span class="num">16.24</span>'],
                  ["hdmi2 FULLSCREEN (LSM)", '<span class="num">16.44</span>', '<span class="num">17.06</span>'],
                  ["boot-done", '<span class="num">31.01</span>', '<span class="num">32.02</span>']], "timing")
              + proc([[code("com.webos.app.inputcommon"), '<span class="num">1746</span>', '<span class="num">1746</span>, <span class="num">1747</span>', "sam (1685)"]])
              + '<p class="note">RSS 66.5 / PSS 40.5 / swap 14.6 MB while showing HDMI 2 ' + src("docs/background-apps.md") + ".</p>")
    + section("Interfaces",
              "<p>One privileged role covers every input alias: <code>allowedNames</code> = inputcommon, livetv, externalinput.av1/av2/component/scart, hdmi1&ndash;4, smhl, <code>com.webos.media.client.*</code> " + src("p28:/usr/share/ls2/roles/prv/com.webos.app.inputcommon.json") + ".</p>"
              + calls("inputcommon", 16, prefer=["com.webos.service.eim", "com.webos.applicationManager", "com.webos.settingsservice", "com.webos.service.acb", "com.webos.notification"])
              + "<p>Input status comes from <code>com.webos.service.eim/getInputStatus</code> (subscribed). The EIM snapshot shows HDMI 1&ndash;4 and AV, with HDMI 2 carrying a SIMPLINK sub-device " + src("boot1/settings/eim_allInputStatus.json") + "; user labels and device names are omitted here.</p>")
    + section("Notes",
              "<ul><li>For monitor use this is the only app that has to work: picture is up 0.3&ndash;0.8 s after the launch request.</li>"
              "<li>The banner, livepick, ACR layer and teletext are all components of this one QML tree (<code>TvComponent/</code>, 26 directories).</li>"
              "<li>In boot 2 an input change came from <code>com.webos.service.tv.externaldevice</code> (HDMI-CEC) at +4087 s.</li></ul>")
    + "</div>")

# INPUT PICKER --------------------------------------------------------------------------------
add("input-picker", "Input picker", "Input picker", "com.webos.app.quickinputpicker (QML module)", ["comp", "qml"],
    paired(tv(picker_stage(), "recon", "Values from <code>InputPicker/Style.qml</code>: top band 330 px, <code>#121212</code> at 0.85 opacity (menu transparency is on), 300&times;210 tiles at 10 px spacing, 280 px title tile, 3 px separator at 0.15, selected tile <code>#8f8f8f</code> with the check mark. Input set from the EIM snapshot, labels generic.", title="Input picker reconstruction"), shot("input-picker"))
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("inputpicker") + store_rows([
                  ("/usr/lib/qt5/qml/InputPicker/InputPicker.qml", "entry point, 455 lines"),
                  ("/usr/lib/qt5/qml/InputPicker/Service/", "14 service wrappers (EIM, ASM, IEPG, MRCU, TTS, notification)"),
                  ("/usr/lib/qt5/qml/YSM/SystemUI/SystemUIManager.qml", "registers the pseudo-app id and its <code>main</code>")])
              + '<p>No appinfo.json: the app id exists only in the compositor&rsquo;s table ' + src("p28:/usr/lib/qt5/qml/YSM/SystemUI/SystemUIManager.qml") + ":</p>"
              + '<pre class="code">{ "id": "com.webos.app.quickinputpicker",\n  "defaultWindowType": "overlay",\n  "main": "file:///usr/lib/qt5/qml/InputPicker/InputPicker.qml" }</pre>')
    + section("How it loads",
              '<ol class="chain"><li>Input key or a caller hits the compositor&rsquo;s private method <code>showInputPicker</code> on its lifecycle service ' + src("p28:/usr/lib/qt5/qml/YSM/YSM.qml:929") + "</li>"
              "<li><code>sysuiManager.launch('com.webos.app.quickinputpicker')</code> loads the QML inside <strong>surface-manager-starfish</strong> (PID 1584). SAM is not involved; the code comment says LSM provides the lifecycle &ldquo;without SAM interfacing&rdquo;.</li>"
              "<li>Picking a tile calls <code>com.webos.applicationManager/launch</code>. Boot 2 logs <code>caller_id com.webos.app.quickinputpicker</code> launching hdmi2 at 63.8 s and hdmi1 at 73.5 s " + src("boot2/runtime/var_log.tar:messages") + "</li></ol>"
              + proc([[code("surface-manager-starfish"), '<span class="num">1584</span>', '<span class="num">1584</span>', "upstart <code>surface-manager</code> (respawn)"]])
              + '<p class="note">Upstart: <code>start on ls-hubd_public-ready and stopped gpu-libs and tvwin-ready</code>, <code>emits lsm-ready</code>, <code>STARFISH_WINDOW_WIDTH=1920</code> ' + src("p28:/etc/init/surface-manager.conf") + ".</p>")
    + section("Interfaces",
              "<p>Runs under the compositor&rsquo;s privileged role, which reserves <code>com.webos.surfacemanager.inputpicker</code> and <code>com.webos.app.quickinputpicker</code> " + src("p28:/usr/share/ls2/roles/prv/com.webos.surfacemanager.json") + ".</p>"
              + calls("inputpicker", 12)
              + "<p>Gated by <code>systemSettings.disableInputPickerButton</code> in YSM; <code>ysm.inputPopups: true</code> in " + src("p28:/etc/lsm/default.json") + ".</p>")
    + section("Notes",
              "<ul><li>The <code>com.webos.app.inputmgr</code> id referenced from inputcommon has no bundle on this firmware; the picker is this QML module.</li>"
              + ("<li>The screenshot shows the real tile text placement; labels set on the TV are blanked.</li></ul>" if SHOTS["shots"].get("input-picker") else
                 "<li>Real screenshots would help here most: no ground truth for tile text placement or category labels.</li></ul>"))
    + "</div>")

# SETTINGS ------------------------------------------------------------------------------------
add("ui-settings", "Settings", "Settings and Quick Settings", "com.palm.app.settings · com.webos.app.quicksettings", ["web", "comp", "qml"],
    '<div class="pair">'
    + tv(None, "real", "<code>index.en.html</code> ships a prerendered first frame as a string assigned to <code>#root.innerHTML</code>. Rendered here with the app&rsquo;s own <code>main.css</code> (pruned to used selectors), no scripts. LG Display and Museo Sans are not shipped, so text uses Nunito Sans; LG dingbat nav icons show as dashed placeholders.", iframe=SD["settings"], title="Settings app prerendered markup")
    + tv(qs_stage(), "recon", "Quick Settings from <code>QuickSettings/Utils/Style.qml</code> and <code>QuickSettings.qml</code>: 864 px black gradient (0.94 → 0.76 → 0), column at x 43, 70 px icons, captions 27 px, close button <code>#4d4d4d</code>. Values shown are this TV&rsquo;s: picture mode <code>eco</code>, sound <code>standard</code>, output <code>tv_speaker</code>.", title="Quick Settings reconstruction")
    + shot("quick-settings")
    + "</div>"
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("settings") + sizes("quicksettings") + store_rows([
                  ("/usr/palm/applications/com.palm.app.settings/main.js", "2.1 MB Enact bundle"),
                  ("/usr/palm/applications/com.palm.app.settings/snapshot_blob.bin", "6.0 MB V8 startup snapshot (<code>v8SnapshotFile</code>)"),
                  ("/usr/palm/applications/com.palm.app.settings/index.*.html", "70 per-locale prerendered entry pages"),
                  ("/usr/lib/qt5/qml/QuickSettings/QuickSettings.qml", "Quick Settings entry, loaded by the compositor")])
              + appinfo("settings", "p28:/usr/palm/applications/com.palm.app.settings/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li><strong>Settings</strong>: SAM → WebAppMgr (upstart <code>WebAppMgr</code>, <code>start on lsm-ready and (init-boot-done or wam-start)</code>) ' + src("p28:/etc/init/WebAppMgr.conf") + ".</li>"
              "<li><code>usePrerendering: true</code>: WAM paints the localized prerendered HTML first; the inline loader then appends <code>main.js</code> or, when a V8 snapshot already holds <code>App</code>, calls <code>ReactDOM.render</code> directly " + src("p28:…/com.palm.app.settings/index.html") + "</li>"
              "<li>The prerender is skipped when launched with a <code>target</code> param or when <code>localStorage.menuTransparency</code> is <code>off</code> " + src("p28:…/com.palm.app.settings/index.en.html") + "</li>"
              "<li>Not preloaded and not running in either snapshot. Runs in a WAM renderer (<code>WebAppMgr --type=renderer</code>) under user <code>wam</code>.</li>"
              "<li><strong>Quick Settings</strong>: compositor private method <code>showQuickSettings</code> → <code>sysuiManager.launch('com.webos.app.quicksettings')</code> " + src("p28:/usr/lib/qt5/qml/YSM/YSM.qml:935") + "; disabled when <code>systemSettings.disableQuickSettings</code>.</li></ol>"
              + proc([[code("WebAppMgr (browser)"), '<span class="num">3073</span>', '<span class="num">3084</span>', "upstart <code>WebAppMgr</code>"],
                      [code("WebAppMgr --type=zygote"), '<span class="num">3379</span>', '<span class="num">3402</span>', "WebAppMgr"],
                      [code("surface-manager-starfish"), '<span class="num">1584</span>', '<span class="num">1584</span>', "upstart"]]))
    + section("Interfaces",
              "<p>Settings role: <code>allowedNames [\"com.palm.app.settings-*\"]</code>, <code>outbound [\"*\"]</code>; client permission groups <code>private</code>, <code>public</code> " + src("p28:/usr/share/luna-service2/{roles.d,client-permissions.d}/com.palm.app.settings.app.json") + ".</p>"
              + calls("settings", 14, prefer=["com.webos.settingsservice", "com.webos.applicationManager"])
              + "<p class=\"cap\">Quick Settings calls:</p>" + calls("quicksettings", 10)
              + "<p>Settings keys read include <code>picture.pictureMode</code>, <code>sound.soundMode</code>, <code>sound.soundOutput</code>, <code>option.menuTransparency</code> (values on this TV: eco, standard, tv_speaker, on) " + src("boot1/settings/system/category_{picture,sound,option}.json") + ".</p>")
    + section("Notes",
              "<ul><li>The prerendered frame only contains the nav rail and an empty Picture panel; list content arrives after hydration.</li>"
              "<li>appinfo declares <code>supportQuickStart: false</code> and <code>defaultWindowType: overlay</code>: Settings floats over the HDMI picture rather than replacing it.</li></ul>")
    + "</div>")

# NOTIFICATIONS ------------------------------------------------------------------------------
add("notifications", "Notifications", "Notifications and toasts", "notificationmgr · SystemUI/Notification · com.webos.app.notificationcenter", ["daemon", "comp", "web"],
    '<div class="pair">'
    + tv(toast_stage(), "recon", "Toast from <code>NotificationStyle.qml</code>: 825&times;111, <code>#ededed</code> at 0.97, radius 9, 81 px icon on <code>#505050</code>, 24 px bold text <code>#333</code>, 21 px from the top-right corner. Text is the Homebrew Channel failsafe toast from <code>startup.sh</code>.", title="Toast reconstruction")
    + shot("toast")
    + tv(None, "real", "Notification Center&rsquo;s prerendered <code>index.en.html</code> body with its <code>main.css</code>, no scripts: the empty state (&ldquo;0 Items&rdquo;).", iframe=SD["notificationcenter"], title="Notification center prerendered markup")
    + "</div>"
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("notification") + sizes("notificationcenter") + store_rows([
                  ("/usr/sbin/notificationmgr", "303 KB daemon, bus name <code>com.webos.notification</code>"),
                  ("/usr/lib/qt5/qml/SystemUI/Notification/", "Toast, Alert, PincodePrompt views drawn by the compositor"),
                  ("/usr/palm/applications/com.webos.app.notificationcenter/", "history list, Enact web app")])
              + appinfo("notificationcenter", "p28:/usr/palm/applications/com.webos.app.notificationcenter/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li><code>notificationmgr</code>: upstart, <code>start on minimal-boot-done and stopped configurator</code>, respawn ' + src("p28:/etc/init/notificationmgr.conf") + ".</li>"
              "<li>Clients call <code>createToast</code>/<code>createAlert</code>. The compositor lazy-loads <code>NotificationView.qml</code> " + src("p28:/usr/lib/qt5/qml/YSM/SystemUI/SystemUIViewStateTransitionManager.qml") + ", whose services subscribe to <code>com.webos.notification/getToastNotification</code>, <code>getAlertNotification</code>, <code>getInputAlertNotification</code> and <code>getPincodePromptNotification</code> " + src("p28:/usr/lib/qt5/qml/SystemUI/Notification/Services.qml") + ".</li>"
              "<li>One toast at a time: <code>toastModelMaxCount: 1</code> " + src("p28:/usr/lib/qt5/qml/SystemUI/Notification/Services.qml:335") + ".</li>"
              "<li>Notification Center is an ordinary WAM app (<code>usePrerendering</code>, V8 snapshot), not preloaded.</li></ol>"
              + proc([[code("notificationmgr"), '<span class="num">3334</span>', '<span class="num">3373</span>', "upstart"],
                      [code("surface-manager-starfish"), '<span class="num">1584</span>', '<span class="num">1584</span>', "upstart"]]))
    + section("Interfaces",
              "<p>API groups exposed by notificationmgr " + src("p28:/usr/share/luna-service2/api-permissions.d/com.webos.notification.api.json") + ":</p>"
              + table(["Group", "Methods"], [[code("notifications.manage"), "createNotification, createToast, removeNotification"],
                                             [code("notifications.query"), "getNotification, getNotificationInfo, getRemoteNotificationInfo"],
                                             [code("notifications"), "closeAlert, closeAllAlerts, closeInputAlert, closePincodePrompt, closeToast, createAlert, createInputAlert, …"]], "kv")
              + "<p>Its own outbound list is restricted: <code>com.webos.service.bus</code>, <code>com.webos.settingsservice</code>, <code>com.palm.db</code>, <code>com.webos.service.tv.systemproperty</code>, <code>com.palm.systemservice</code>, <code>com.webos.applicationManager</code>, <code>com.webos.service.tvpower</code> " + src("p28:/usr/share/luna-service2/roles.d/com.webos.notification.role.json") + ".</p>"
              + calls("notification", 6)
              + "<p>Toasts are suppressed when <code>option.enableToastPopup</code> is off (on here) " + src("boot1/settings/system/category_option.json") + ".</p>")
    + section("Notes",
              "<ul><li>Homebrew Channel uses <code>createToast</code> with <code>sourceId webosbrew</code> for failsafe mode and <code>createAlert</code> with a <code>machineReboot</code> button " + src("media/developer/…/org.webosbrew.hbchannel.service/startup.sh:36,40") + ".</li>"
              "<li>Home Assistant&rsquo;s <code>webostv</code> notify target lands here too.</li></ul>")
    + "</div>")

# OSD -------------------------------------------------------------------------------------------
add("osd", "Volume &amp; OSDs", "Volume and other OSDs", "YSM/Volume.qml · com.webos.app.tvhotkey", ["comp", "qml", "native"],
    '<div class="pair">'
    + tv(volume_stage(), "recon", "Volume from <code>YSM/Volume.qml</code> and the <code>volume</code> block of <code>YSM/Style.qml</code>: 21&times;552 bar 39 px from the right edge, fill <code>#cf0652</code>, track <code>rgb(110,110,110)</code> at 0.35, digits are PNGs (40&times;72), shown for 1500 ms. Level 12 is an example.", title="Volume OSD reconstruction")
    + shot("volume")
    + tv(hotkey_stage(), "recon", "Picture Mode hotkey popup from <code>tvhotkey/HotkeyComponent/ListComponentStyle.qml</code>: 660 px wide, black at 0.75, 80 px title icon, 45 px rows, bottom-left. Mode names from <code>StringTable.qml</code>; Eco is this TV&rsquo;s current mode.", title="Hotkey popup reconstruction")
    + shot("hotkey")
    + "</div>"
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("volume") + sizes("tvhotkey") + store_rows([
                  ("/usr/lib/qt5/qml/YSM/images/", "volume_*.png slices and digits 0&ndash;9"),
                  ("/usr/lib/qt5/qml/StarfishComponents/libaudioserviceplugin.so", "QML <code>AudioService</code> used by the compositor"),
                  ("/usr/bin/com.webos.app.tvhotkey", "27 KB Qt host for the hotkey popups")])
              + appinfo("tvhotkey", "p28:/usr/palm/applications/com.webos.app.tvhotkey/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li><strong>Volume</strong> is part of the compositor: <code>StarfishKeyFilter.qml</code> maps volume keys to <code>audioService.volumeUp/Down/toggleVolumeMute</code> ' + src("p28:/usr/lib/qt5/qml/YSM/YSM.qml:1201-1205") + "; no app launch.</li>"
              "<li>The plugin talks to <code>luna://com.webos.audio/{getVolume,volumeUp,volumeDown,volumeKeeping,setMuted}</code> as <code>com.webos.surfacemanager.audio</code> " + src("strings libaudioserviceplugin.so") + ".</li>"
              "<li><strong>tvhotkey</strong> is an ls-hubd-activated native app (<code>Type=static</code> service file) with <code>defaultWindowType: popup</code> and <code>supportQuickStart: true</code>; it was not running in either snapshot " + src("p28:/usr/share/dbus-1/system-services/com.webos.app.tvhotkey.service") + ".</li></ol>"
              + proc([[code("surface-manager-starfish"), '<span class="num">1584</span>', '<span class="num">1584</span>', "upstart"],
                      [code("com.webos.app.tvhotkey"), "not running", "not running", "on demand"]]))
    + section("Interfaces",
              "<p>Volume runs under the compositor role; tvhotkey has its own privileged role with <code>inbound/outbound [\"*\"]</code> " + src("p28:/usr/share/ls2/roles/prv/com.webos.app.tvhotkey.json") + ".</p>"
              + calls("tvhotkey", 12, prefer=["com.webos.settingsservice", "com.lge.settingsservice", "com.webos.service.tv.display"])
              + "<p>Picture-mode popup writes <code>picture.pictureMode</code> via <code>com.webos.settingsservice</code> and calls <code>com.webos.service.tv.display/setPSMChangedByUser</code> " + src("p28:…/tvhotkey/qml/picturemode/PictureModeServices.qml") + ".</p>")
    + section("Notes",
              "<ul><li>Other OSD sources live alongside: <code>YSM/MagicNumber.qml</code> (number-key channel entry), <code>YSM/VolumeMute.qml</code>, and tvhotkey&rsquo;s sleeptimer, soundmode, aspectratio, energysaving and simplink popups.</li>"
              "<li>When the output is an external device (<code>volume_exterior</code>), the compositor shows a 60&times;198 up/down pill instead of a level bar.</li></ul>")
    + "</div>")

# LIVE MENU ----------------------------------------------------------------------------------------
add("live-menu", "Live menu", "Live menu", "com.webos.app.livemenu", ["native", "criu", "preload"],
    paired(tv(livemenu_stage(), "recon", "From <code>livemenu/qml/AppInitializer/GlobalStyle.qml</code>: 840 px right panel in black at 0.85, 120 px tab column <code>#333333</code> at 0.95 with 120&times;120 tab icons, 226 px header with a 6 px <code>#404040</code> divider. Panel content is not reconstructed.", title="Live menu reconstruction"), shot("live-menu"))
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("livemenu") + store_rows([
                  ("/usr/bin/com.webos.app.livemenu", "74 KB Qt host"),
                  ("/usr/palm/applications/com.webos.app.livemenu/qml/Pages/", "Page1 (channels/EPG), Page2, PageRecordings, PageScheduler"),
                  ("/mnt/lg/cmn_data/checkpoint/com.webos.app.livemenu/", "CRIU image, 18.7 MB, written 2026-10-25 21:19 during boot 2")])
              + appinfo("livemenu", "p28:/usr/palm/applications/com.webos.app.livemenu/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li>Preload policy entry <code>criu / periodic / 40 MB</code> ' + src("boot1/settings/preloadPolicy.json") + ".</li>"
              "<li>Boot 2: launched by <code>com.webos.app.hdmi1</code> at 82.1 s (live-menu key while on an input), PID 1902, then dumped: <code>Dumping processes (pid: 1902)</code> &hellip; <code>Dumping finished successfully</code> " + src("boot2/runtime/var_log.tar:com.webos.app.livemenu_criu_dump.log") + ".</li>"
              "<li>Later launches restore from that image instead of a cold QML start.</li></ol>"
              + proc([[code("com.webos.app.livemenu"), "not running", '<span class="num">1902</span>', "sam (1685)"]]))
    + section("Interfaces",
              "<p>Privileged role, <code>inbound/outbound [\"*\"]</code> " + src("p28:/usr/share/ls2/roles/prv/com.webos.app.livemenu.json") + ".</p>"
              + calls("livemenu", 14, prefer=["com.webos.service.iepg", "com.webos.applicationManager", "com.webos.settingsservice"]))
    + section("Notes",
              "<ul><li>On an HDMI-only setup the live menu has little to show; it still costs a checkpoint image on eMMC.</li>"
              "<li><code>enablePigScreenSaver: false</code> and <code>defaultWindowType: overlay</code>.</li></ul>")
    + "</div>")

# HOMEBREW --------------------------------------------------------------------------------------------
add("homebrew", "Homebrew", "Homebrew Channel", "org.webosbrew.hbchannel 0.7.3", ["web", "dev"],
    (tv(None, "real", "<code>index.html</code> run once in headless Chromium with networking disabled; the resulting DOM was saved and all scripts removed. The repository fetch fails offline, hence the error toast and empty list. Museo Sans swapped for Nunito Sans; Miso and the Moonstone icon font are the bundle&rsquo;s own.", iframe=SD["homebrew"], title="Homebrew Channel rendered DOM")
     if "homebrew" in SD else
     '<p class="note">Preview not generated: this build had no Homebrew Channel DOM capture (it needs Chromium; see <code>tools/ui-atlas/README.md</code>).</p>')
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("homebrew") + store_rows([
                  ("/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/index.html", "690 KB single-file Enyo/Moonstone app"),
                  ("/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/service.js", "656 KB Node service"),
                  ("/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh", "boot hook (telnet failsafe, sshd, init.d)"),
                  ("/var/lib/webosbrew/startup.sh", "copy that actually runs"),
                  ("/var/luna/preferences/webosbrew_*", "feature flags (sshd, block updates, telnet disabled)")])
              + '<p class="cap">appinfo.json ' + src("media/developer/…/org.webosbrew.hbchannel/appinfo.json") + "</p>"
              + table(["Field", "Value"], [[code("type"), code('"web"')], [code("main"), code('"index.html"')],
                                           [code("previewMetadata.targetEndpoint"), code('"luna://org.webosbrew.hbchannel.service/autostart"')],
                                           [code("visible / supportQuickStart / keepAlive"), '<span class="muted">not set</span>']], "kv"))
    + section("How it loads",
              '<ol class="chain"><li>App: SAM → WebAppMgr like any dev-mode web app (<code>ApplicationPaths</code> type <code>dev</code>) ' + src("p28:/etc/palm/sam-conf.json") + ".</li>"
              "<li>Service: registered in the dev hub (<code>/var/luna-service2-dev/services.d/</code>); <code>Exec</code> is a sed-patched <code>run-js-service</code> running unjailed as root " + src("docs/startup.md") + ".</li>"
              "<li><code>autostart</code> fires after <code>core-boot-done</code> via activitymanager or the <code>previewMetadata</code> endpoint and runs <code>startup.sh</code> at ~35&ndash;37 s.</li>"
              "<li>Not preloaded. Docs record a WAM renderer for it only when opened by hand " + src("docs/background-apps.md") + ".</li></ol>"
              + proc([[code("dropbear -R"), '<span class="num">4851</span>', '<span class="num">4856</span>', "HBC <code>startup.sh</code>"]]))
    + section("Interfaces",
              "<p>Service methods registered in <code>service.js</code>: " + ", ".join(code(m) for m in ["autostart", "checkRoot", "elevateService", "exec", "getAppInfo", "getConfiguration", "getDrmStatus", "install", "reboot", "registerActivity", "setConfiguration", "spawn", "uninstall", "updateStartupScript"]) + ".</p>"
              "<p>The app calls <code>luna://org.webosbrew.hbchannel.service</code> {getAppInfo, getConfiguration, setConfiguration, install, uninstall, reboot, updateStartupScript} and fetches <code>https://repo.webosbrew.org/api/apps.json</code> " + src("…/org.webosbrew.hbchannel/index.html") + ".</p>"
              "<p>The service calls <code>com.webos.appInstallService/dev/install</code>, <code>/dev/remove</code>, <code>com.webos.applicationManager/dev/listApps</code>, <code>com.webos.bootManager/getBootStatus</code>, <code>com.webos.notification/createToast</code>.</p>")
    + section("Notes",
              "<ul><li>The only element here that lives on rw storage (p53), so it survives firmware updates but not a factory reset.</li>"
              "<li><code>exec</code> and <code>spawn</code> give any caller that can reach the service a root shell command; keep the service off the public bus.</li></ul>")
    + "</div>")

# AIRPLAY ------------------------------------------------------------------------------------------------
add("airplay", "AirPlay", "AirPlay", "airplay (app) · airplay.service · airplay.homekit", ["web", "preload", "daemon"],
    tv(airplay_stage(), "schem", "The bundle has no UI of its own: <code>launch.html</code> forwards to the <code>contentTarget</code> URL. Drawn from the role files, the service list and <code>libairplay-webengine.so.1</code> symbols.", title="AirPlay launch chain schematic")
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("airplay") + store_rows([
                  ("/usr/palm/applications/airplay/launch.html", "17-line redirector"),
                  ("/usr/palm/applications/airplay/cors_whitelist.json", "Apple CDN domains and media types (signed: <code>.sig</code>)"),
                  ("/usr/sbin/airplay", "875 KB daemon, ls-hubd on-demand"),
                  ("/usr/sbin/airplay-adaptor", "upstart <code>start on boot-done</code>"),
                  ("/usr/sbin/homekit", "986 KB HomeKit pairing daemon"),
                  ("/usr/lib/libairplay-webengine.so.1", "launches the web app (<code>launchAirplayAppPreloaded</code>)")])
              + appinfo("airplay", "p28:/usr/palm/applications/airplay/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li><code>airplay-adaptor</code> starts at <code>boot-done</code>; ls-hubd spawns <code>/usr/sbin/airplay</code> on first call ' + src("p28:/etc/init/airplay-adaptor.conf") + ".</li>"
              "<li>The daemon launches its own UI as a preload: <code>NL_APP_LAUNCH_BEGIN {\"app_id\":\"airplay\",\"caller_id\":\"airplay.service\"}</code> at 38.3 s (boot 1) and 39.4 s (boot 2) " + src("boot{1,2}/runtime/var_log.tar:messages") + ".</li>"
              "<li>Preload policy <code>partial / periodic / 50 MB</code>, enabled at runtime though static config says disabled " + src("docs/background-apps.md") + ".</li>"
              "<li>WAM renderer started ~38 s after boot (PID 5134 boot 1, 5149 boot 2), inferred to be airplay from start time.</li></ol>"
              + proc([[code("airplay"), '<span class="num">5111</span>', '<span class="num">5109</span>', "ls-hubd (1477)"],
                      [code("airplay-adaptor"), '<span class="num">4315</span>', '<span class="num">4353</span>', "upstart"],
                      [code("homekit"), '<span class="num">4496</span>', '<span class="num">4441</span>', "ls-hubd (1477)"]])
              + '<p class="note">Cost: renderer 42.9 RSS / 23.4 PSS / 18.4 MB swap, daemon 11.8 RSS, homekit 5.9 RSS ' + src("docs/background-apps.md") + ".</p>")
    + section("Interfaces",
              "<p>Daemon role: <code>allowedNames [\"\", \"airplay.service\", \"com.webos.rm.client.*\"]</code>, <code>inbound/outbound [\"*\"]</code> " + src("p28:/usr/share/ls2/roles/prv/airplay.service.json") + ". App role: <code>airplay-*</code>, outbound <code>*</code> " + src("p28:/usr/share/luna-service2/roles.d/airplay.json") + ".</p>"
              "<p>HomeKit API: <code>airplay.homekit/{subscribeSetupCodeChanged, subscribePairingEvent, reset, debug}</code> " + src("p28:/usr/share/luna-service2/api-permissions.d/airplay.homekit.api.json") + ".</p>"
              "<p>Deep link: <code>deeplinkingParams {\"contentTarget\":\"$CONTENTID\"}</code>; listens on TCP 7000 " + src("docs/startup.md") + ".</p>")
    + section("Notes",
              "<ul><li>Largest preload once swap is counted; turning AirPlay off in Settings is the supported way to stop it.</li>"
              "<li>Open: what <code>contentTarget</code> points at. A WAM devtools session (port 9998 is open) would show it without writing to the TV.</li></ul>")
    + "</div>")

# ASSISTANT ------------------------------------------------------------------------------------------------
add("assistant", "Assistant", "Google Assistant", "com.webos.app.googleassistant", ["web", "preload", "keep"],
    tv(None, "real", "<code>weather_screen_out.html</code>, a Google response card shipped inside the bundle as a test fixture, scripts removed and <code>#popout</code> forced visible. Live cards come from <code>developers.google.com/webassistant</code> at runtime and are never on disk.", iframe=SD["assistant"], title="Google Assistant bundled sample card")
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("assistant") + store_rows([
                  ("/usr/palm/applications/com.webos.app.googleassistant/index.html", "27 KB shell that iframes the remote web assistant"),
                  ("/usr/palm/applications/com.webos.app.googleassistant/js/testAudioStreaming.js", "524 KB audio streaming test harness"),
                  ("/usr/palm/applications/com.webos.app.googleassistant/*_screen_out.html", "8 sample cards (weather, sports, people)"),
                  ("/usr/sbin/nlpadapter", "5.8 MB native adapter, jailed (<code>jailer -t native_mvpd</code>)")])
              + appinfo("assistant", "p28:/usr/palm/applications/com.webos.app.googleassistant/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li>Preloaded by <code>com.webos.service.preloadmanager</code> at 53.0 s (boot 1) and 54.0 s (boot 2) ' + src("boot{1,2}/runtime/var_log.tar:messages") + ".</li>"
              "<li>Policy <code>partial / periodic</code>, priority 5, 42 MB; also on memorymanager <code>KeepOnLaunchEx</code> " + src("boot1/settings/preloadPolicy.json, p28:/etc/palm/memorymanager-conf.json") + ".</li>"
              "<li>The preload manager itself starts on <code>boot-done and memchute-ready and lsm-ready</code>, after <code>resourcemon --wait-cpu-under=30</code> " + src("p28:/etc/init/webos-preload-manager.conf") + ".</li>"
              "<li><code>index.html</code> loads <code>https://developers.google.com/webassistant/prod/websocket/webassistant.html?…&amp;embeddingOrigin=file://com.webos.app.googleassistant&amp;backKeyCode=461</code>.</li></ol>"
              + proc([[code("WebAppMgr renderer"), '<span class="num">5238</span>', '<span class="num">5261</span>', "WAM zygote; inferred from start time"],
                      [code("webos-preload-manager"), '<span class="num">4296</span>', '<span class="num">4305</span>', "upstart"]])
              + '<p class="note">30.6 RSS / 12.9 PSS / 3.3 MB swap ' + src("docs/background-apps.md") + ".</p>")
    + section("Interfaces",
              "<p>The bundle exposes <code>com.webos.app.googleassistant.nlpadapter</code>: public <code>requestNewConversation</code>; private <code>cancel, disableSignIn, enableSignIn, getAccountsDetail, request, requestIntent, requestSignOut, requestText, stopAudioIn, …</code> " + src("p28:/usr/share/luna-service2/api-permissions.d/com.webos.app.googleassistant.nlpadapter.api.json") + ".</p>"
              + calls("assistant", 12)
              + "<p><code>requiredEULA: \"voice2\"</code>, <code>privilegedJail: true</code>, <code>requiredPermissions [\"all\"]</code>, <code>standAloneLaunchable: false</code>.</p>")
    + section("Notes",
              "<ul><li>The sample pages include queries such as &ldquo;who is Larry Page&rdquo;; they look like developer fixtures left in the production bundle.</li>"
              "<li>The only microphone path is the Magic Remote push-to-talk " + src("docs/sensors-and-mic.md") + ".</li></ul>")
    + "</div>")

# KEYBOARD ----------------------------------------------------------------------------------------------------
add("keyboard", "Keyboard", "Virtual keyboard", "MaliitServer · com.webos.service.ime", ["daemon", "qml"],
    paired(tv(keyboard_stage(), "recon", "Geometry from <code>maliit/plugins/qml/keyboard-common/Style.qml</code>: 1920&times;324 panel <code>#4b4b4b</code>, 174 px left function column, 1474 px letter area, 192 px right column, 52 px rows with 6 px gaps, keys <code>#282828</code>, focus <code>#cf0652</code>. Key legends are illustrative; real layouts come from the language data in <code>libplugin-global.so</code>.", title="Virtual keyboard reconstruction"), shot("keyboard"))
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("keyboard") + store_rows([
                  ("/usr/sbin/MaliitServer", "73 KB server"),
                  ("/usr/lib/maliit/plugins/libplugin-global.so", "global layouts (770 KB); CHN/ and JPN/ plugins alongside"),
                  ("/usr/lib/maliit/plugins/qml/view-global/main.qml", "keyboard UI"),
                  ("/usr/lib/maliit/plugins/libstt-plugin.so", "speech-to-text accessory plugin"),
                  ("/var/lib/maliit/server.conf", "generated at first start by the upstart script")]))
    + section("How it loads",
              '<ol class="chain"><li>Upstart <code>start on (ime-activate) or (minimal-boot-done and settingsservice-ready and lsm-ready)</code>; pre-start stops it unless <code>com.webos.service.ime.static</code> is true or the event is <code>ime-activate</code> ' + src("p28:/etc/init/MaliitServer.conf") + ".</li>"
              "<li>It renders through Wayland (<code>QT_QPA_PLATFORM=wayland-egl</code>); the compositor places it with <code>YSM/PopUps/Keyboard.qml</code> and tracks <code>ysm.overlayKeyboard</code>.</li>"
              "<li>The compositor itself runs with <code>QT_IM_MODULE=none</code> " + src("p28:/etc/init/surface-manager.conf") + ".</li></ol>"
              + proc([[code("MaliitServer"), '<span class="num">3475</span>', '<span class="num">3480</span>', "upstart (respawn)"]]))
    + section("Interfaces",
              "<p>Privileged role with names <code>com.webos.service.ime</code>, <code>com.webos.service.ime.stt</code>, <code>com.webos.service.ime.globalplugin</code>, all <code>inbound/outbound [\"*\"]</code> " + src("p28:/usr/share/ls2/roles/prv/com.webos.service.ime.json") + ".</p>"
              + calls("keyboard", 8))
    + section("Notes",
              "<ul><li>Resident in both snapshots even though nothing had asked for text input: <code>com.webos.service.ime.static</code> is <code>true</code> " + src("boot1/settings/configs.json") + ", so the pre-start check lets it run at boot.</li>"
              "<li>The keyboard is a separate Wayland client, not part of any app; web apps reach it through WAM&rsquo;s input method bridge.</li></ul>")
    + "</div>")

# SCREENSAVER -------------------------------------------------------------------------------------------------
add("screensaver", "Screensaver", "Screen saver", "com.webos.app.screensaver", ["qml"],
    tv(screensaver_stage(), "recon", "Canvas re-implementation of <code>Containers/ScreenSaver.qml</code>: three particle groups coloured from <code>blue.png</code>, <code>Turquoise.png</code>, <code>red.png</code> colour tables, centred emitters, velocity 7&plusmn;3, acceleration 12&plusmn;5, turbulence 10; the hint text is <code>#6e6e6e</code> 27 px with a 3.5 s fade. Motion stops when reduced motion is requested.", title="Screen saver reconstruction")
    + '<div class="grid">'
    + section("Where it&rsquo;s stored",
              sizes("screensaver") + store_rows([
                  ("/usr/palm/applications/com.webos.app.screensaver/qml/main.qml", "entry, 1920&times;1080 transparent root"),
                  ("/usr/lib/qt5/qml/YSM/ScreenSaver/", "compositor side: how the screensaver window is stacked and dismissed")])
              + appinfo("screensaver", "p28:/usr/palm/applications/com.webos.app.screensaver/appinfo.json"))
    + section("How it loads",
              '<ol class="chain"><li><code>type: \"qml\"</code>: SAM starts it with <code>QmlRunnerPath /usr/bin/qml-runner</code> ' + src("p28:/etc/palm/sam-conf.json") + ". The QML booster that could pre-fork qml-runner is off: <code>booster stop/waiting</code> " + src("boot2/runtime/initctl_list.txt") + ".</li>"
              "<li>Window type <code>screenSaver</code>; YSM gives the screensaver its own layer and closes it on any key.</li>"
              "<li>Not running in either snapshot.</li></ol>")
    + section("Interfaces",
              "<p>Regular role <code>com.webos.app.screensaver-*</code>, outbound <code>*</code> " + src("p28:/usr/share/luna-service2/roles.d/com.webos.app.screensaver.app.json") + ".</p>"
              + calls("screensaver", 10))
    + section("Notes",
              "<ul><li>The bundle also has an ad path (<code>AdImageView.qml</code>, <code>Controllers/AdInterfaces/AdMock.js</code>): the screen saver can show sponsored images.</li>"
              "<li>On an OLED used as a monitor, <code>oled-epl</code> and this app are the panel-protection pair.</li></ul>")
    + "</div>")

# ------------------------------------------------------------------ overview
ELEMS = [
    ("home", "Home launcher", "com.webos.app.home", ["native", "boot", "criu", "keep", "preload"], "sam → native Qt + CRIU", "recon"),
    ("hdmi-input", "HDMI input", "com.webos.app.inputcommon / hdmi2", ["native", "boot", "criu", "preload"], "sam → native Qt + CRIU", "recon"),
    ("input-picker", "Input picker", "com.webos.app.quickinputpicker", ["comp", "qml"], "surface-manager", "recon"),
    ("ui-settings", "Settings", "com.palm.app.settings", ["web"], "sam → WebAppMgr", "real"),
    ("ui-settings", "Quick Settings", "com.webos.app.quicksettings", ["comp", "qml"], "surface-manager", "recon"),
    ("notifications", "Toasts / alerts", "notificationmgr → SystemUI", ["daemon", "comp"], "notificationmgr + surface-manager", "recon"),
    ("notifications", "Notification Center", "com.webos.app.notificationcenter", ["web"], "sam → WebAppMgr", "real"),
    ("osd", "Volume OSD", "YSM/Volume.qml", ["comp", "qml"], "surface-manager", "recon"),
    ("osd", "Hotkey popups", "com.webos.app.tvhotkey", ["native"], "ls-hubd on demand", "recon"),
    ("live-menu", "Live menu", "com.webos.app.livemenu", ["native", "criu", "preload"], "sam → native Qt + CRIU", "recon"),
    ("homebrew", "Homebrew Channel", "org.webosbrew.hbchannel", ["web", "dev"], "sam → WebAppMgr", "real"),
    ("airplay", "AirPlay", "airplay", ["web", "preload", "daemon"], "airplay.service → sam → WAM", "schem"),
    ("assistant", "Google Assistant", "com.webos.app.googleassistant", ["web", "preload", "keep"], "preloadmanager → sam → WAM", "real"),
    ("keyboard", "Virtual keyboard", "MaliitServer", ["daemon", "qml"], "upstart MaliitServer", "recon"),
    ("screensaver", "Screen saver", "com.webos.app.screensaver", ["qml"], "sam → qml-runner", "recon"),
]

DIAGRAM = '''<div class="scroll diagram"><svg viewBox="0 0 980 470" width="980" height="470" role="img" aria-labelledby="dgt">
<title id="dgt">Launch chain: upstart and bootd start SAM; SAM hands web apps to WebAppMgr, native apps to their Qt binaries with CRIU restore, QML apps to qml-runner; all surfaces go to surface-manager, which also draws its own overlays.</title>
<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="d-arrow"/></marker></defs>
<g class="d-box"><rect x="20" y="30" width="200" height="64"/><rect x="20" y="130" width="200" height="64"/><rect x="20" y="230" width="200" height="64"/>
<rect x="300" y="130" width="190" height="64"/>
<rect x="570" y="20" width="200" height="64"/><rect x="570" y="110" width="200" height="64"/><rect x="570" y="200" width="200" height="64"/><rect x="570" y="290" width="200" height="64"/>
<rect x="300" y="300" width="190" height="64"/><rect x="300" y="390" width="190" height="64"/></g>
<rect x="830" y="20" width="130" height="430" class="d-comp"/>
<g class="d-t"><text x="34" y="58">upstart + bootd</text><text x="34" y="80" class="d-s">signals, first app</text>
<text x="34" y="158">preload-manager</text><text x="34" y="180" class="d-s">policy, ~53–69 s</text>
<text x="34" y="258">ls-hubd services</text><text x="34" y="280" class="d-s">airplay, tvhotkey</text>
<text x="314" y="158">SAM</text><text x="314" y="180" class="d-s">/usr/sbin/sam</text>
<text x="584" y="48">WebAppMgr</text><text x="584" y="70" class="d-s">type web · renderers</text>
<text x="584" y="138">native Qt host</text><text x="584" y="160" class="d-s">type native · QML inside</text>
<text x="584" y="228">CRIU restore</text><text x="584" y="250" class="d-s">/tmp/checkpoint, cmn_data</text>
<text x="584" y="318">qml-runner</text><text x="584" y="340" class="d-s">type qml (booster off)</text>
<text x="314" y="328">notificationmgr</text><text x="314" y="350" class="d-s">toasts, alerts</text>
<text x="314" y="418">MaliitServer</text><text x="314" y="440" class="d-s">keyboard client</text>
<text x="842" y="50">surface-</text><text x="842" y="72">manager</text><text x="842" y="94" class="d-s">YSM QML</text>
<text x="842" y="150" class="d-s">built in:</text><text x="842" y="174" class="d-s">input picker</text><text x="842" y="198" class="d-s">quick settings</text><text x="842" y="222" class="d-s">volume</text><text x="842" y="246" class="d-s">toast view</text><text x="842" y="270" class="d-s">magic number</text>
<text x="842" y="420" class="d-s">→ panel</text></g>
<g class="d-l" marker-end="url(#arr)"><path d="M220 62 C260 62 260 150 296 155"/><path d="M220 162 H296"/><path d="M220 262 C260 262 260 180 296 175"/>
<path d="M490 150 C530 150 530 52 566 52"/><path d="M490 158 C530 158 530 142 566 142"/><path d="M490 170 C530 170 530 232 566 232"/><path d="M490 182 C530 182 530 322 566 322"/>
<path d="M770 52 H826"/><path d="M770 142 H826"/><path d="M770 232 H826"/><path d="M770 322 H826"/><path d="M490 332 H826"/><path d="M490 422 H826"/></g>
</svg></div>'''

ov_rows = []
for tid, name, ident, bk, host, r in ELEMS:
    ov_rows.append([f'<a href="#{tid}" data-tab="{tid}">{esc(name)}</a>', code(ident), badges(bk), esc(host), rl(r)])

overview = (
    '<div class="ov-intro"><p>Reference catalogue of the on-screen UI of one LG OLED (webOS 4.5, firmware 05.40.45, SoC M19A1) used as an HDMI monitor. '
    'Each tab shows one GUI element, where it sits on the eMMC, how it gets onto the screen and which bus interfaces it uses. '
    'Everything was read from the 2026-10-25 backup: the active rootfs image <code>p28</code> (squashfs, extracted locally), the otncabi image <code>p31</code>, '
    'the <code>/media/developer</code>, <code>/var</code> and <code>cmn_data</code> tars, two boots of runtime snapshots, and the repo docs. '
    + (f"No command touched the TV, except for the screenshots: on {SHOTS['captured']} each overlay was opened over luna on the live TV and captured with the compositor&rsquo;s <code>captureCompositorOutput</code>, then closed again (see the legend).</p></div>" if SHOTS["shots"] else "No command touched the TV.</p></div>")
    + '<h3 class="h3">Elements</h3>' + table(["Element", "Id / module", "Type", "Hosted by", "Render"], ov_rows, "ov")
    + '<div class="grid two">'
    + section("Launch chain", DIAGRAM + '<p class="cap">Sources: <code>/etc/init/{sam,surface-manager,WebAppMgr,MaliitServer,notificationmgr,webos-preload-manager,booster,criu}.conf</code>, <code>/etc/palm/sam-conf*.json</code>, <code>YSM/SystemUI/SystemUIManager.qml</code>.</p>', "wide")
    + section("Legend",
              '<dl class="legend">'
              f'<dt>{rl("real")}</dt><dd>The app&rsquo;s own HTML and CSS from the bundle, rendered in a sandboxed frame with scripts removed. Proprietary LG fonts are substituted.</dd>'
              f'<dt>{rl("recon")}</dt><dd>Rebuilt in HTML from real PNGs and layout values read out of the QML (sizes, colours, margins). Faithful in geometry, not a screenshot.</dd>'
              f'<dt>{rl("schem")}</dt><dd>A diagram. Used where the bundle has no UI of its own.</dd>'
              + (f'<dt>{rl("shot")}</dt><dd>The compositor&rsquo;s own frame from <code>luna://com.webos.surfacemanager/captureCompositorOutput</code> (PNG, 1920&times;1080), shown next to the reconstruction. HDMI video is a separate hardware plane and captures black. Personal labels are blanked or pixelated.</dd>' if SHOTS["shots"] else "")
              +
              '</dl><dl class="legend">'
              + "".join(f'<dt>{badges([k])}</dt><dd>{d}</dd>' for k, d in [
                  ("web", "<code>type: web</code>, run by WebAppMgr (Chromium-based)."),
                  ("native", "<code>type: native</code>; on this TV a small Qt binary that loads the bundle&rsquo;s QML."),
                  ("qml", "QML UI, either an app run by qml-runner or a module."),
                  ("comp", "No SAM app: QML loaded inside surface-manager-starfish."),
                  ("daemon", "Long-running service process."),
                  ("boot", "In SAM <code>BootTimeApps</code>."),
                  ("criu", "In <code>CRIUSupportApps</code> / preload mode <code>criu</code>: checkpoint image restored on launch."),
                  ("preload", "In the preload-manager policy and enabled."),
                  ("keep", "memorymanager <code>KeepOnLaunchEx</code>."),
                  ("dev", "Developer-mode app on rw storage.")])
              + "</dl><p class=\"cap\"><code>keepAlive</code> and <code>supportQuickStart</code> are shown per tab; no element here sets <code>keepAlive</code>.</p>", "wide legend-wrap")
    + section("Storage map",
              table(["Mount", "Partition", "Fs", "Holds"], [
                  [code("/"), "p28 rootfs (+ p30 bsppart overlay)", "squashfs ro", "/usr/palm/applications, /usr/lib/qt5/qml, /etc/init, ACG files"],
                  [code("/mnt/otncabi"), "p31", "squashfs ro", "LG Content Store and preinstalled partner apps"],
                  [code("/mnt/otycabi"), "p32", "squashfs ro", "also mounted on /usr/lib/nyx/modules; no apps"],
                  [code("/var, /home, /mnt/lg/cmn_data"), "p52", "ext4 rw", "preferences, logs, CRIU images"],
                  [code("/media"), "p53", "ext4 rw", "store apps (cryptofs), /media/developer"],
                  [code("/tmp/checkpoint"), "tmpfs", "RAM", "CRIU images for this boot"]], "store")
              + '<p class="cap">Partition roles from ' + src("docs/recovery.md") + "; mounts from " + src("boot2/runtime/proc_mounts.txt") + ". Boot 1 had a hand-mounted rw overlay on <code>/</code>; boot 2 shows the stock read-only stack.</p>")
    + section("Boot timing", table(["Signal", "Boot 1 (s)", "Boot 2 (s)"], [
        ["BOOTD_START", "14.48", "14.45"], ["core-boot-done", "15.66", "15.78"], ["HDMI 2 FULLSCREEN", "16.44", "17.06"],
        ["init-boot-done", "18.70", "18.93"], ["minimal-boot-done", "19.69", "19.87"], ["rest-boot-done", "28.03", "29.03"],
        ["boot-done", "31.01", "32.02"], ["airplay preload", "38.32", "39.37"], ["Google Assistant preload", "53.02", "54.02"],
        ["Netflix preload", "60.02", "62.02"], ["YouTube preload", "67.02", "69.02"]], "timing")
        + '<p class="cap">' + src("boot{1,2}/runtime/bootd.log") + ", " + src("boot{1,2}/runtime/var_log.tar:messages") + ". Times are monotonic seconds since kernel start; the 5.1 s SAM launches of home, fullhome and inputcommon are frozen inside the system snapshot.</p>")
    + "</div>")

TABS.insert(0, ("overview", "Overview", "webOS UI Atlas", "LG OLED · webOS 4.5 · 05.40.45", [], overview))

# ------------------------------------------------------------------ page
CSS = ('@font-face{font-family:"Miso";src:url(fonts/Miso-Regular.ttf);font-weight:400 600}@font-face{font-family:"Miso";src:url(fonts/Miso-Light.ttf);font-weight:300}@font-face{font-family:"Miso";src:url(fonts/Miso-Bold.ttf);font-weight:700}' + open(os.path.join(HERE, "page.css")).read())
JS = open(os.path.join(HERE, "page.js")).read()

nav = "".join(f'<button role="tab" id="t-{t[0]}" aria-controls="p-{t[0]}" data-tab="{t[0]}">{t[1]}</button>' for t in TABS)
panels = []
for tid, short, name, ident, bk, body in TABS:
    head = (f'<header class="ph"><h2>{name}</h2><p class="ident">{esc(ident)}</p><div class="bl">{badges(bk)}</div></header>' if tid != "overview" else "")
    panels.append(f'<section class="panel" role="tabpanel" id="p-{tid}" data-tab="{tid}" aria-labelledby="t-{tid}" hidden>{head}{body}</section>')

page = f'''<title>webOS UI Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&family=Nunito+Sans:wght@300;400;600;700;800&display=swap">
<style>{CSS}</style>
<div class="wrap">
<header class="top"><p class="eyebrow">Research notebook · {"read-only capture 2026-10-25" if not SHOTS["shots"] else "backup 2026-10-25 · screenshots " + SHOTS["captured"]}</p><h1>webOS UI Atlas</h1>
<p class="lede">The GUI elements of an LG OLED running webOS 4.5, used as an HDMI monitor: what each one looks like, where it is stored, how it reaches the screen, and what it talks to.</p></header>
<nav class="tabs" role="tablist" aria-label="GUI elements"><div class="tabs-in">{nav}</div></nav>
<main>{"".join(panels)}</main>
<footer class="foot"><p>Paths prefixed <code>p28:</code> are inside the active rootfs image; <code>boot1/</code> and <code>boot2/</code> are the two runtime captures; <code>var_log.tar:</code> names a file inside a capture&rsquo;s <code>/var/log</code> tar; <code>docs/</code> is the TV repo. Serials, network identifiers, account data, device names and the kernel command line are deliberately left out.</p></footer>
</div>
<script>{JS}</script>
'''
open(OUT, "w").write(page)
print("wrote", OUT, len(page))
