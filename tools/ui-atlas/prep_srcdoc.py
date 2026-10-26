"""Produce the srcdoc HTML strings for the real-markup previews.
python3 -I prep_srcdoc.py WORK_DIR OUT_JSON [HBC_DOM_HTML]
Output: {"settings": html, "notificationcenter": html, "assistant": html, "homebrew": html}
"homebrew" is present only when HBC_DOM_HTML (the Chromium DOM capture) is given.
Rules: no <script> survives; fonts point at fonts/*.ttf (published next to the page);
LG-proprietary fonts (LG Display, LG Display_Dingbat, Museo Sans) are NOT shipped: their
families are re-pointed at Google's Nunito Sans, and dingbat glyphs are masked.
"""
import sys, os, re, json

G, OUT = sys.argv[1], sys.argv[2]
HBC_DOM = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
A = os.path.join(G, "rootfs/usr/palm/applications")
GF = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,700&display=swap">'
VIDEO = "radial-gradient(ellipse at 30% 40%,#3c4d5e 0,#1d2732 45%,#0b0f14 100%)"


def strip_scripts(s):
    s = re.sub(r"<script\b.*?</script>", "", s, flags=re.S | re.I)
    s = re.sub(r"<script\b[^>]*/>", "", s, flags=re.I)
    s = re.sub(r"\son[a-z]+=\"[^\"]*\"", "", s)
    return s


def unjs(s):
    return json.loads('"' + s.replace("\\'", "'").replace('"', '\\"') + '"')


def fontfix(css):
    css = re.sub(r"@font-face\{[^}]*\}", "", css)
    css = re.sub(r"font-family:\s*Moonstone LG Display[^;}]*", 'font-family:"Nunito Sans",sans-serif', css)
    css = re.sub(r"font-family:\s*MuseoSans[^;}]*", 'font-family:"Nunito Sans",sans-serif', css)
    css = re.sub(r"font-family:\s*LG Display_Dingbat", 'font-family:"LGDingbatNotShipped"', css)
    css = re.sub(r"font-family:\s*LG Icons", 'font-family:"LGDingbatNotShipped"', css)
    return css


def prune_css(css, markup):
    """Keep only rules whose class selectors appear in the markup (crude, depth-aware)."""
    classes = set(re.findall(r'class="([^"]*)"', markup))
    present = set()
    for c in classes:
        present.update(c.split())
    out, i, n = [], 0, len(css)

    def keep(sel):
        for part in sel.split(","):
            cls = re.findall(r"\.([A-Za-z0-9_\-]+)", part)
            if not cls or all(c in present for c in cls):
                return True
        return False

    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        sel = css[i:j].strip()
        if sel.startswith("@media") or sel.startswith("@supports"):
            depth, k = 1, j + 1
            while depth and k < n:
                if css[k] == "{":
                    depth += 1
                elif css[k] == "}":
                    depth -= 1
                k += 1
            inner = prune_css(css[j + 1:k - 1], markup)
            if inner.strip():
                out.append(sel + "{" + inner + "}")
            i = k
            continue
        k = css.find("}", j)
        body = css[j + 1:k]
        if sel.startswith("@") or keep(sel):
            out.append(sel + "{" + body + "}")
        i = k + 1
    return "".join(out)


ENACT_FONTS = ('@font-face{font-family:"Moonstone Icons";src:url(fonts/Moonstone-enact.ttf)}'
               '@font-face{font-family:"Moonstone Miso";src:url(fonts/Miso-Regular.ttf);font-weight:400}'
               '@font-face{font-family:"Moonstone Miso";src:url(fonts/Miso-Light.ttf);font-weight:300}'
               '@font-face{font-family:"Moonstone Miso";src:url(fonts/Miso-Bold.ttf);font-weight:700}')
MASK = ('[class*="1JTVAx1jIuQx18aRKaS523"]{color:transparent!important;position:relative}'
        '[class*="1JTVAx1jIuQx18aRKaS523"]::after{content:"";position:absolute;inset:18%;border:2px dashed rgba(255,255,255,.45);border-radius:50%}')


def enact_doc(app, markup, extra=""):
    css = open(os.path.join(A, app, "main.css"), encoding="utf-8").read()
    css = prune_css(fontfix(css), markup)
    return ("<!doctype html><html style=\"font-size:24px\"><head><meta charset=\"utf-8\">" + GF +
            "<style>" + ENACT_FONTS + css + MASK +
            "html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:" + VIDEO + "}" + extra +
            "</style></head><body><div id=\"root\">" + markup + "</div></body></html>")


out = {}
# Settings: markup lives in a JS string assigned to #root.innerHTML in index.en.html
s = open(os.path.join(A, "com.palm.app.settings/index.en.html"), encoding="utf-8").read()
m = re.search(r"innerHTML='((?:[^'\\]|\\.)*)'", s)
out["settings"] = enact_doc("com.palm.app.settings", strip_scripts(unjs(m.group(1))))

# Notification center: markup is directly inside #root
s = open(os.path.join(A, "com.webos.app.notificationcenter/index.en.html"), encoding="utf-8").read()
i = s.index('<div id="root">') + len('<div id="root">')
end = s.find("<script", i)
body = s[i:end if end > 0 else s.index("</body>")]
body = body.rsplit("</div>", 1)[0]
out["notificationcenter"] = enact_doc("com.webos.app.notificationcenter", strip_scripts(body))

# Google Assistant: bundled sample response card (fixture), scripts stripped
s = open(os.path.join(A, "com.webos.app.googleassistant/weather_screen_out.html"), encoding="utf-8").read()
s = strip_scripts(s)
# the fixture's logo is a remote image; the page loads nothing but Google Fonts
s = re.sub(r"url\(\s*['\"]?https?://[^)]*\)", "none", s)
s = s.replace("<head>", "<head><style>html,body{width:1920px;height:1080px;margin:0;overflow:hidden!important;background:" + VIDEO +
              "!important}#popout{opacity:1!important;position:fixed!important;bottom:0!important;transform:none!important}</style>", 1)
out["assistant"] = s

# Homebrew Channel: DOM captured from headless Chromium (no network), scripts stripped
if HBC_DOM:
    d = open(HBC_DOM, encoding="utf-8").read()
    d = strip_scripts(d)
    d = d.replace("moonstone/fonts/Miso/", "fonts/").replace("moonstone/fonts/Moonstone.ttf", "fonts/Moonstone-enyo.ttf")
    d = re.sub(r'font-family:\s*"(MuseoSans|Moonstone LG Display)[^"]*"', 'font-family:"Nunito Sans",sans-serif', d)
    d = re.sub(r"url\(moonstone/fonts/MuseoSans/[^)]*\)", "local(\"Nunito Sans\")", d)
    d = re.sub(r"url\(['\"]?moonstone/images/[^)]*\)", "none", d)
    d = d.replace("<head>", "<head>" + GF + "<style>html,body{width:1920px;height:1080px;overflow:hidden}"
                  "body,.moon,.moon-body-text,.moon-header-sub-title-below{font-family:\"Nunito Sans\",sans-serif}</style>", 1)
    out["homebrew"] = d

for k, v in out.items():
    assert "<script" not in v.lower(), k
    ext = [u for u in re.findall(r"(?:src|href)=[\"']?(https?://[^\"' >]+)|url\(\s*['\"]?(https?://[^)'\"]+)", v)
           if not (u[0] or u[1]).startswith("https://fonts.googleapis.com/")]
    assert not ext, (k, ext[:3])
    print(k, len(v))
json.dump(out, open(OUT, "w"))
