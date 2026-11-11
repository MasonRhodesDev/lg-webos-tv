#!/usr/bin/env bash
# snapshot-watcher — poll the TV every 5 s, log NVM + hib state changes and
# dmesg suspend/resume events. Used during the snapshot-boot research.
#
# Usage: scripts/snapshot-watcher.sh <output-log>
# Reads TV_HOST and TV_USER from .env (default TV_USER=root).

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$REPO_DIR/.env" ]]; then
    # shellcheck disable=SC1090
    . "$REPO_DIR/.env"
fi
TV_HOST="${TV_HOST:?Set TV_HOST in .env}"
TV_USER="${TV_USER:-root}"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <output-log>" >&2
    exit 1
fi
OUT="$1"
TV="${TV_USER}@${TV_HOST}"
PREV_HASH=""
PREV_DMESG_LEN=0

echo "=== watcher started $(date -Is) ===" | tee -a "$OUT"

while :; do
  now="$(date -Is)"
  # Compact remote probe: NVM bytes + hib header + /sys/power/state
  remote="$(ssh -q -o ConnectTimeout=5 "$TV" '
    N=$(dd if=/dev/mmcblk0p11 bs=1 count=4 skip=427 2>/dev/null | od -An -v -tu1 | tr -s " " "_")  # 0x1ab..0x1ae
    M=$(dd if=/dev/mmcblk0p11 bs=1 count=4 skip=2441 2>/dev/null | od -An -v -tu1 | tr -s " " "_") # 0x989..0x98c
    HH=$(dd if=/dev/mmcblk0p48 bs=1 count=256 skip=3840 2>/dev/null | sha256sum | cut -c1-16)
    PS=$(cat /sys/power/state 2>/dev/null | tr -d "\n")
    UP=$(cut -d" " -f1 /proc/uptime)
    DM_LINES=$(dmesg | wc -l)
    echo "N=$N M=$M HH=$HH PS=\"$PS\" UP=$UP DM=$DM_LINES"
  ' 2>&1)"
  if [ -z "$remote" ]; then
    echo "$now  TV_UNREACHABLE" | tee -a "$OUT"
  else
    cur_hash="$(echo "$remote" | sha256sum | cut -c1-16)"
    if [ "$cur_hash" != "$PREV_HASH" ]; then
      echo "$now  $remote" | tee -a "$OUT"
      PREV_HASH="$cur_hash"
      dm_len="$(echo "$remote" | sed -n 's/.* DM=\([0-9]*\).*/\1/p')"
      if [ -n "$dm_len" ] && [ "$dm_len" != "$PREV_DMESG_LEN" ]; then
        if [ "$PREV_DMESG_LEN" -gt 0 ]; then
          new="$((dm_len - PREV_DMESG_LEN))"
          [ "$new" -gt 0 ] && ssh -q -o ConnectTimeout=5 "$TV" "dmesg | tail -n $new" 2>/dev/null \
            | grep -iE 'suspend|resume|snapshot|hib|QBP|quick' \
            | head -20 | sed "s/^/$now  DM: /" | tee -a "$OUT"
        fi
        PREV_DMESG_LEN="$dm_len"
      fi
    fi
  fi
  sleep 5
done
