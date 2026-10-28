#!/bin/sh
# Package the theme-pack demo as a webOS web app (.ipk) for sideloading.
# Usage: build-ipk.sh [OUT_DIR] [FONTS_DIR]
#   FONTS_DIR is the output of fetch-fonts.sh; without it the app falls back to system fonts.
# Needs: sh, tar, gzip, node.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$here/dist}
fonts=${2:-}
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
cp "$here/service/service.js" "$here/service/services.json" "$here/service/package.json" "$svc/"
node "$here/export-json.mjs" "$svc/packs" >/dev/null
mkdir -p "$svc/data" && chmod 0777 "$svc/data"
cp "$here/tv/packageinfo.json" "$work/data/usr/palm/packages/$id/"
if [ -n "$fonts" ]; then mkdir -p "$app/fonts" && cp "$fonts"/* "$app/fonts/"; fi

# The demo page with paths rewritten for the app root, TV mode on, and local fonts.
sed -e 's#\.\./##g' \
    -e "s#<script src=\"runtime/theme-pack.js\"></script>#<script>window.THEME_PACK_TV = true;</script>\n<script src=\"runtime/theme-pack.js\"></script>#" \
    -e "s#</head>#$( [ -n "$fonts" ] && echo '<link rel="stylesheet" href="fonts/fonts.css">' )\n</head>#" \
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
