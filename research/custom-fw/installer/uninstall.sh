#!/usr/bin/env bash
# uninstall.sh — restore p48 and p11 from backups.
#
# Usage:
#   TV_HOST=<tv-address> ./installer/uninstall.sh
#
# Default backup source order:
#   1. installer/backups-runtime/<latest>/   (made by install.sh)
#   2. backups/*.pre-install.bin             (committed baseline)
#
# Override with:
#   P11=path/to/p11.bin P48=path/to/p48.bin ./installer/uninstall.sh

set -euo pipefail

: "${TV_HOST:?TV_HOST=user@ip is required}"
SSH_OPTS="${SSH_OPTS:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/.." && pwd)"

pick_backup() {
    # $1 = runtime filename, $2 = fallback filename
    local runtime="$HERE/backups-runtime"
    if [ -d "$runtime" ]; then
        local latest
        latest="$(ls -1 "$runtime" 2>/dev/null | sort | tail -1)"
        if [ -n "$latest" ] && [ -f "$runtime/$latest/$1" ]; then
            echo "$runtime/$latest/$1"; return
        fi
    fi
    echo "$PROJECT/backups/$2"
}

P11="${P11:-$(pick_backup p11_env_nvm.bin p11_env_nvm.pre-install.bin)}"
P48="${P48:-$(pick_backup p48_hib.bin p48_hib.pre-install.bin)}"
[ -f "$P11" ] || { echo "no p11 backup: $P11" >&2; exit 1; }
[ -f "$P48" ] || { echo "no p48 backup: $P48" >&2; exit 1; }

p11_size=$(stat -c%s "$P11")
p48_size=$(stat -c%s "$P48")
[ "$p11_size" -ge 262144 ] || { echo "p11 backup too small ($p11_size)" >&2; exit 1; }
[ "$p48_size" = "157286400" ] || { echo "p48 backup wrong size ($p48_size != 157286400)" >&2; exit 1; }

echo "[*] Restoring from:"
echo "    $P11  ($p11_size bytes)"
echo "    $P48  ($p48_size bytes)"

SSH="ssh -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=10 $SSH_OPTS $TV_HOST"

echo "[*] Restoring p48 → /dev/mmcblk0p48"
$SSH 'dd of=/dev/mmcblk0p48 bs=1M 2>&1 | tail -3' < "$P48"

echo "[*] Restoring p11 → /dev/mmcblk0p11 (first 256 KB only)"
dd if="$P11" bs=1M count=1 2>/dev/null | $SSH 'dd of=/dev/mmcblk0p11 bs=1M conv=notrunc 2>&1 | tail -3'

$SSH 'sync; echo "--- post-restore check ---"; printf "p11[0x1AB]="; dd if=/dev/mmcblk0p11 bs=1 count=1 skip=427 2>/dev/null | od -An -c | tr -d " "; echo; printf "p11[0x989]="; dd if=/dev/mmcblk0p11 bs=1 count=1 skip=2441 2>/dev/null | od -An -tu1 | tr -d " "; echo'

echo "[+] Restored. Cold-cycle the TV to be certain."
