#!/bin/sh
# Download each style's font (OFL, from Google Fonts) as woff2 into OUT_DIR, with a fonts.css
# that points at the local files. Run on a machine with internet; the TV itself stays offline.
set -eu
out=${1:?usage: fetch-fonts.sh OUT_DIR}
here=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$out"
: > "$out/fonts.css"
# Ask as the TV's engine (Chromium 53): it predates variable fonts, so Google serves one static file per weight.
ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36'
for f in "$here"/packs/styles/*.js; do
  spec=$(node -e "console.log(require('$f').font.google)")
  family=$(node -e "console.log(require('$f').font.family)")
  css=$(curl -fsS -A "$ua" "https://fonts.googleapis.com/css2?family=$spec&display=swap")
  # Keep only the latin subset blocks.
  echo "$css" | awk '/^\/\* /{keep = ($0 == "/* latin */")} keep' > "$out/.block.css"
  grep -o 'https://[^)]*\.woff2' "$out/.block.css" | while read -r url; do
    name=$(echo "$family" | tr -d ' ')-$(basename "$url")
    curl -fsS -o "$out/$name" "$url"
    sed -i "s#$url#$name#" "$out/.block.css"
  done
  cat "$out/.block.css" >> "$out/fonts.css"
done
rm -f "$out/.block.css"
echo "fonts written to $out"
