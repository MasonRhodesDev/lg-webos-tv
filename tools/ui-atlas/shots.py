"""Copy real screenshots into the output and write the manifest build.py reads.

python3 -I shots.py SHOTS_DIR OUT_IMG_SHOTS_DIR WORK_MANIFEST

SHOTS_DIR/manifest.json:
  {"captured": "YYYY-MM-DD",
   "shots": {"<slot>": {"file": "name.webp", "alt": "...", "caption": "HTML"}, ...}}

Slots are the ids build.py knows (SHOT_SLOTS there). Images must already be
web-ready (WebP, PNG or JPEG, ideally <= 300 KB); this script does not convert.
"""
import json, os, re, shutil, sys

SRC, DST, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
m = json.load(open(os.path.join(SRC, "manifest.json"), encoding="utf-8"))
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(m.get("captured", ""))):
    sys.exit("shots: manifest.json needs \"captured\": \"YYYY-MM-DD\"")
os.makedirs(DST, exist_ok=True)
res = {"captured": m["captured"], "shots": {}}
for slot, s in sorted(m.get("shots", {}).items()):
    name = os.path.basename(s["file"])
    if not name.lower().endswith((".webp", ".png", ".jpg", ".jpeg")):
        sys.exit("shots: %s: not a web image: %s" % (slot, name))
    src = os.path.join(SRC, name)
    size = os.path.getsize(src)
    if size > 300 * 1024:
        print("shots: warning: %s is %d KB" % (name, size // 1024), file=sys.stderr)
    shutil.copyfile(src, os.path.join(DST, name))
    res["shots"][slot] = {"src": "img/shots/" + name, "alt": s.get("alt", ""), "caption": s.get("caption", "")}
    print("shot", slot, name, size)
json.dump(res, open(OUT, "w", encoding="utf-8"), indent=1)
