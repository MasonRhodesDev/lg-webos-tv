#!/bin/sh
# Package the theme-pack demo as a webOS web app (.ipk) for sideloading.
# Usage: build-ipk.sh [OUT_DIR]
# Needs: sh, tar, gzip, node.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$here/dist}
id=$(node -e "console.log(require('$here/tv/appinfo.json').id)")
version=$(node -e "console.log(require('$here/tv/appinfo.json').version)")

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
app="$work/data/usr/palm/applications/$id"
mkdir -p "$app" "$work/control" "$out"

cp "$here/tv/appinfo.json" "$here/tv/icon.png" "$here/tv/largeIcon.png" "$app/"
cp -r "$here/runtime" "$here/packs" "$here/screens" "$app/"
cp "$here/demo/app.js" "$app/app.js"

# The Look service and the package manifest that ties it to the app.
svc="$work/data/usr/palm/services/$id.service"
mkdir -p "$svc" "$work/data/usr/palm/packages/$id"
cp "$here/service/service.js" "$here/service/services.json" "$here/service/package.json" "$here/service/permissions.sh" "$svc/"
node "$here/export-json.mjs" "$svc/packs" >/dev/null
cp -r "$here/packs/assets" "$here/packs/fonts" "$svc/packs/"
mkdir -p "$svc/data" && chmod 0777 "$svc/data"
cp "$here/tv/packageinfo.json" "$work/data/usr/palm/packages/$id/"
# The app reads the same font files (packs/ is copied whole above); its weights come from the file names.
node -e '
const fs = require("fs"), path = require("path");
const dir = process.argv[1], css = [];
for (const f of fs.readdirSync(path.join(dir, "packs/styles"))) {
  const font = require(path.join(dir, "packs/styles", f)).font;
  for (const file of font.files) {
    css.push("@font-face { font-family: \x27" + font.family + "\x27; font-style: normal; font-weight: " +
      /-(\d+)\.ttf$/.exec(file)[1] + "; src: url(packs/fonts/" + file + ") format(\x27truetype\x27); }");
  }
}
fs.writeFileSync(path.join(process.argv[2], "fonts.css"), css.join("\n") + "\n");
' "$here" "$app"

# The demo page with paths rewritten for the app root, TV mode on, and local fonts.
sed -e 's#\.\./##g' \
    -e "s#<script src=\"runtime/theme-pack.js\"></script>#<script>window.THEME_PACK_TV = true;</script>\n<script src=\"runtime/theme-pack.js\"></script>#" \
    -e 's#</head>#<link rel="stylesheet" href="fonts.css">\n</head>#' \
    "$here/demo/index.html" > "$app/index.html"

size=$(du -sk "$work/data" | cut -f1)
cat > "$work/control/control" <<EOF
Package: $id
Version: $version
Section: misc
Priority: optional
Architecture: all
Installed-Size: $size
Maintainer: theme-pack
Description: Swappable styles and themes demo
webOS-Package-Format-Version: 2
webOS-Packager-Version: x.y.x
EOF

printf '2.0\n' > "$work/debian-binary"
(cd "$work/control" && tar --owner=0 --group=0 -czf "$work/control.tar.gz" .)
(cd "$work/data" && tar --owner=0 --group=0 -czf "$work/data.tar.gz" .)
ipk="$out/${id}_${version}_all.ipk"
rm -f "$ipk"
# webOS rejects GNU ar's "name/" member names, so write a plain ar archive.
node -e '
const fs = require("fs"), path = require("path");
const [out, dir, ...names] = process.argv.slice(1);
const parts = [Buffer.from("!<arch>\n")];
for (const n of names) {
  const data = fs.readFileSync(path.join(dir, n));
  const field = (v, w) => String(v).padEnd(w, " ");
  parts.push(Buffer.from(field(n, 16) + field(0, 12) + field(0, 6) + field(0, 6) + field(100644, 8) + field(data.length, 10) + "`\n"), data);
  if (data.length % 2) parts.push(Buffer.from("\n"));
}
fs.writeFileSync(out, Buffer.concat(parts));
' "$ipk" "$work" debian-binary control.tar.gz data.tar.gz
echo "$ipk"
