#!/bin/sh
# Build the webOS UI Atlas page from a backup taken with scripts/backup.sh.
#
# Usage: tools/ui-atlas/build.sh [options] BACKUP_DIR OUT_DIR
#
#   BACKUP_DIR   one scripts/backup.sh output directory (it holds images/,
#                files/ and runtime/). Only read, never written.
#   OUT_DIR      where index.html, img/ and fonts/ are written. Keep it out of
#                git: it contains LG's images and fonts.
#
# Options:
#   --capture-hbc      run the Homebrew Channel app once in headless Chromium
#                      (network off) to get its DOM; saved to OUT_DIR/.cache/
#   --hbc-dom FILE     use this saved DOM capture instead
#                      (default: OUT_DIR/.cache/hbc_dom.html if it exists;
#                      otherwise the Homebrew preview is skipped)
#   --shots DIR        add real screenshots: DIR/manifest.json plus the image
#                      files it names (see README.md, "Screenshots")
#   --keep-work        keep the temporary work dir and print its path
#   -h, --help         show this help
#
# Environment:
#   ROOTFS_PART   partition holding the active rootfs, e.g. mmcblk0p28
#                 (default: root= from BACKUP_DIR/runtime/proc_cmdline.txt)
#   OTNCABI_PART  partition mounted on /mnt/otncabi, e.g. mmcblk0p31
#                 (default: from BACKUP_DIR/runtime/proc_mounts.txt)
#   CHROMIUM      Chromium/Chrome binary for --capture-hbc (default: first of
#                 chromium, chromium-browser, google-chrome on PATH)
#   TMPDIR        where the ~1.5 GB work dir is created (default /tmp)
#
# Required tools: sh, unsquashfs (squashfs-tools), tar, python3 (3.8+).
# Optional: Chromium or Chrome, only for --capture-hbc.
set -eu

HERE=$(cd "$(dirname "$0")" && pwd)

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
die() { echo "build.sh: $*" >&2; exit 1; }

CAPTURE_HBC=0
HBC_DOM=
SHOTS=
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --capture-hbc) CAPTURE_HBC=1 ;;
    --hbc-dom) [ $# -ge 2 ] || die "--hbc-dom needs a file"; HBC_DOM=$2; shift ;;
    --shots) [ $# -ge 2 ] || die "--shots needs a directory"; SHOTS=$2; shift ;;
    --keep-work) KEEP=1 ;;
    -h|--help) usage 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1 (see --help)" ;;
    *) break ;;
  esac
  shift
done
[ $# -eq 2 ] || usage 1
BACKUP=$1
OUT=$2

missing=
for t in unsquashfs tar python3; do
  command -v "$t" >/dev/null 2>&1 || missing="$missing $t"
done
[ -z "$missing" ] || die "missing required tool(s):$missing (see tools/ui-atlas/README.md)"

[ -d "$BACKUP/images" ] && [ -d "$BACKUP/files" ] ||
  die "$BACKUP does not look like a scripts/backup.sh output (no images/ or files/)"
BACKUP=$(cd "$BACKUP" && pwd)

# Which partitions: the runtime capture says what was mounted where.
if [ -z "${ROOTFS_PART:-}" ]; then
  [ -f "$BACKUP/runtime/proc_cmdline.txt" ] || die "set ROOTFS_PART (no runtime/proc_cmdline.txt)"
  ROOTFS_PART=$(tr ' ' '\n' < "$BACKUP/runtime/proc_cmdline.txt" | sed -n 's|^root=/dev/||p' | head -n 1)
  [ -n "$ROOTFS_PART" ] || die "no root= in runtime/proc_cmdline.txt; set ROOTFS_PART"
fi
if [ -z "${OTNCABI_PART:-}" ]; then
  [ -f "$BACKUP/runtime/proc_mounts.txt" ] || die "set OTNCABI_PART (no runtime/proc_mounts.txt)"
  OTNCABI_PART=$(awk '$2 == "/mnt/otncabi" { sub("^/dev/", "", $1); print $1; exit }' "$BACKUP/runtime/proc_mounts.txt")
  [ -n "$OTNCABI_PART" ] || die "/mnt/otncabi not in runtime/proc_mounts.txt; set OTNCABI_PART"
fi

one_image() {
  # backup.sh names images s<start-sector>_<part>.img
  set -- "$BACKUP"/images/s*_"$1".img
  [ $# -eq 1 ] && [ -f "$1" ] || die "expected exactly one image for $2 in $BACKUP/images"
  echo "$1"
}
ROOTFS_IMG=$(one_image "$ROOTFS_PART" "the rootfs ($ROOTFS_PART)")
OTNCABI_IMG=$(one_image "$OTNCABI_PART" "otncabi ($OTNCABI_PART)")
DEV_TAR=$BACKUP/files/media_developer.tar
[ -f "$DEV_TAR" ] || die "missing $DEV_TAR"

if [ -n "$SHOTS" ]; then
  [ -f "$SHOTS/manifest.json" ] || die "--shots: no manifest.json in $SHOTS"
  SHOTS=$(cd "$SHOTS" && pwd)
fi

mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
case "$OUT/" in "$BACKUP"/*) die "OUT_DIR must not be inside BACKUP_DIR" ;; esac

WORK=$(mktemp -d "${TMPDIR:-/tmp}/ui-atlas.XXXXXX")
cleanup() {
  if [ "$KEEP" = 1 ]; then echo "work dir kept: $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

echo "rootfs:  $ROOTFS_IMG"
echo "otncabi: $OTNCABI_IMG"
echo "tar:     $DEV_TAR"
echo "work:    $WORK"

echo "== extracting"
unsquashfs -q -no-progress -no-xattrs -d "$WORK/rootfs" "$ROOTFS_IMG" >/dev/null
unsquashfs -q -no-progress -no-xattrs -d "$WORK/otncabi" "$OTNCABI_IMG" >/dev/null
mkdir -p "$WORK/x/media_developer"
tar -xf "$DEV_TAR" --no-same-owner --no-same-permissions -C "$WORK/x/media_developer" media/developer/apps
HBC_APP=$WORK/x/media_developer/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel

# Homebrew Channel DOM: fresh capture, a given file, or the cached copy.
if [ "$CAPTURE_HBC" = 1 ]; then
  CH=${CHROMIUM:-}
  if [ -z "$CH" ]; then
    for c in chromium chromium-browser google-chrome google-chrome-stable; do
      if command -v "$c" >/dev/null 2>&1; then CH=$c; break; fi
    done
  fi
  [ -n "$CH" ] || die "--capture-hbc needs Chromium or Chrome on PATH (or set CHROMIUM)"
  echo "== capturing Homebrew Channel DOM with $CH (network off)"
  mkdir -p "$OUT/.cache"
  # Every host resolves to nothing and the proxy is a closed port, so the app's
  # repository fetch fails offline. Headless takes 56 px of the window for
  # browser chrome; 1920x1136 leaves the app the TV's 1920x1080 viewport.
  "$CH" --headless --disable-gpu --no-first-run --no-default-browser-check \
    --user-data-dir="$WORK/chrome-profile" \
    --host-resolver-rules="MAP * ~NOTFOUND" --proxy-server="127.0.0.1:9" \
    --window-size=1920,1136 --virtual-time-budget=5000 \
    --dump-dom "file://$HBC_APP/index.html" > "$WORK/hbc_dom.html" 2> "$WORK/chrome.log" ||
    die "Chromium failed; see $WORK/chrome.log (use --keep-work)"
  [ -s "$WORK/hbc_dom.html" ] || die "Chromium produced an empty DOM"
  cp "$WORK/hbc_dom.html" "$OUT/.cache/hbc_dom.html"
  HBC_DOM=$WORK/hbc_dom.html
elif [ -n "$HBC_DOM" ]; then
  [ -f "$HBC_DOM" ] || die "--hbc-dom: no such file: $HBC_DOM"
elif [ -f "$OUT/.cache/hbc_dom.html" ]; then
  HBC_DOM=$OUT/.cache/hbc_dom.html
  echo "== using cached Homebrew Channel DOM: $HBC_DOM"
else
  echo "== no Homebrew Channel DOM: skipping that preview (use --capture-hbc with Chromium, or --hbc-dom FILE)"
fi

echo "== collect"
python3 -I "$HERE/collect.py" "$WORK" "$WORK/facts.json" >/dev/null
echo "== prep_srcdoc"
python3 -I "$HERE/prep_srcdoc.py" "$WORK" "$WORK/srcdoc.json" "$HBC_DOM" >/dev/null

echo "== assets"
rm -rf "$OUT/img" "$OUT/fonts"
mkdir -p "$OUT/img" "$OUT/fonts"
n=0
while IFS="$(printf '\t')" read -r dst src; do
  case "$dst" in ''|'#'*) continue ;; esac
  case "$src" in
    rootfs/*|otncabi/*) from=$WORK/$src ;;
    developer/*) from=$WORK/x/media_developer/media/$src ;;
    *) die "assets.tsv: unknown source root in: $src" ;;
  esac
  [ -f "$from" ] || die "assets.tsv: missing in this backup: $src"
  cp "$from" "$OUT/$dst"
  chmod 644 "$OUT/$dst"
  n=$((n + 1))
done < "$HERE/assets.tsv"
echo "copied $n files"

if [ -n "$SHOTS" ]; then
  echo "== screenshots"
  mkdir -p "$WORK/shots" "$OUT/img/shots"
  python3 -I "$HERE/shots.py" "$SHOTS" "$OUT/img/shots" "$WORK/shots/manifest.json"
fi

echo "== build"
python3 -I "$HERE/build.py" "$WORK" "$OUT"
echo "done: $OUT/index.html"
