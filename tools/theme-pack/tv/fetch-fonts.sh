#!/bin/sh
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
