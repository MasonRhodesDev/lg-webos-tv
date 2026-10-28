#!/bin/sh
# Package the theme-pack demo as a webOS web app (.ipk) for sideloading.
# Usage: build-ipk.sh [OUT_DIR] [FONTS_DIR]
#   FONTS_DIR is the output of fetch-fonts.sh; without it the app falls back to system fonts.
# Needs: sh, tar, gzip, ar (binutils).
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
(cd "$work" && ar -qc "$ipk" debian-binary control.tar.gz data.tar.gz)
echo "$ipk"
