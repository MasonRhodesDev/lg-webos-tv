#!/bin/sh
# Download each style's font from Google Fonts into packs/fonts/<family>/, with its OFL licence. The files are
# committed, so building needs no internet; rerun this only when a style's font or weights change.
# Static per-weight TrueType files, because neither consumer reads anything newer: the TV's Qt 5.6 FreeType has no
# WOFF2, and Chromium 53 predates variable fonts. Google serves TTF to a client it does not recognise.
# Each style lists its files in font.files, relative to packs/fonts: <family>/<family>-<weight>.ttf.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
for f in "$here"/packs/styles/*.js; do
  spec=$(node -e "console.log(require('$f').font.google)")
  family=$(node -e "console.log(require('$f').font.family)")
  dir=$(echo "$family" | tr -d ' ')
  slug=$(echo "$family" | tr -d ' ' | tr '[:upper:]' '[:lower:]')
  out="$here/packs/fonts/$dir"
  rm -rf "$out" && mkdir -p "$out"
  for w in $(echo "$spec" | sed 's/.*@//' | tr ';' ' '); do
    url=$(curl -fsS "https://fonts.googleapis.com/css2?family=$(echo "$spec" | sed 's/@.*//')@$w" | grep -o 'https://[^)]*\.ttf')
    curl -fsS -o "$out/$dir-$w.ttf" "$url"
  done
  curl -fsS -o "$out/OFL.txt" "https://raw.githubusercontent.com/google/fonts/main/ofl/$slug/OFL.txt"
  echo "$family: $(ls "$out" | tr '\n' ' ')"
done
