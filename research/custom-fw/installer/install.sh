#!/usr/bin/env bash
# install.sh — flash a built hib image to the B9 and set the two
# "resume pending" bytes in the env partition.
#
# Usage:
#   TV_HOST=<tv-address> ./installer/install.sh path/to/hib.img
#   TV_HOST=<tv-address> ./installer/install.sh           # uses payload/build/hib.img
#
# Environment:
#   TV_HOST    required (user@ip for ssh)
#   SSH_OPTS   extra options to ssh (e.g. -i <keyfile>)
#   NO_BACKUP  set to 1 to skip the runtime backup step (not recommended)
#
# What it does:
#   1. Pulls p11 (env) + p48 (hib) from the TV into
#      installer/backups-runtime/<timestamp>/. This is a second backup;
#      the repo's committed backups/*.pre-install.bin is the first.
#   2. dd's the hib image to /dev/mmcblk0p48.
#   3. Writes 0x53 ('S') at p11[0x1AB] and 0x01 at p11[0x989].
#   4. sync, verify.
#
# Rollback: installer/uninstall.sh with the same TV_HOST.

set -euo pipefail

: "${TV_HOST:?TV_HOST=user@ip is required}"
SSH_OPTS="${SSH_OPTS:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/.." && pwd)"

HIB="${1:-$PROJECT/payload/build/hib.img}"
[ -f "$HIB" ] || { echo "hib image not found: $HIB" >&2; echo "Build it first: ./payload/build.sh" >&2; exit 1; }
size=$(stat -c%s "$HIB")
[ "$size" = "157286400" ] || { echo "hib size wrong ($size != 157286400)" >&2; exit 1; }

echo "[*] Target: $TV_HOST"
echo "[*] Hib image: $HIB ($size bytes)"
sha256sum "$HIB"

SSH="ssh -o ControlMaster=no -o ControlPath=none -o ConnectTimeout=10 $SSH_OPTS $TV_HOST"

if [ "${NO_BACKUP:-0}" != "1" ]; then
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    bdir="$HERE/backups-runtime/$stamp"
    mkdir -p "$bdir"
    echo "[*] Pulling p11 backup → $bdir/p11_env_nvm.bin"
    $SSH 'dd if=/dev/mmcblk0p11 bs=1M count=1 2>/dev/null' > "$bdir/p11_env_nvm.bin"
    echo "[*] Pulling p48 backup → $bdir/p48_hib.bin (150 MB, ~15–60s)"
    $SSH 'dd if=/dev/mmcblk0p48 bs=1M 2>/dev/null' > "$bdir/p48_hib.bin"
    (cd "$bdir" && sha256sum *.bin > SHA256SUMS)
    echo "[*] Runtime backups saved."
fi

echo "[*] Writing hib → /dev/mmcblk0p48"
$SSH 'dd of=/dev/mmcblk0p48 bs=1M 2>&1 | tail -3' < "$HIB"

echo "[*] Setting resume-pending bytes in /dev/mmcblk0p11"
$SSH '
    printf "\x53" | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=427  conv=notrunc 2>&1 | tail -1
    printf "\x01" | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=2441 conv=notrunc 2>&1 | tail -1
    sync
    echo "--- post-write verify ---"
    printf "p11[0x1AB]="; dd if=/dev/mmcblk0p11 bs=1 count=1 skip=427  2>/dev/null | od -An -c | tr -d " "; echo
    printf "p11[0x989]="; dd if=/dev/mmcblk0p11 bs=1 count=1 skip=2441 2>/dev/null | od -An -tu1 | tr -d " "; echo
'

exp_1mb=$(dd if="$HIB" bs=1M count=1 2>/dev/null | sha256sum | awk "{print \$1}")
got_1mb=$($SSH 'dd if=/dev/mmcblk0p48 bs=1M count=1 2>/dev/null | sha256sum | awk "{print \$1}"')
if [ "$exp_1mb" = "$got_1mb" ]; then
    echo "[+] first-1MB sha256 matches hib.img"
else
    echo "[!] first-1MB sha256 mismatch: expected $exp_1mb got $got_1mb" >&2
    exit 1
fi

echo
echo "[+] Installed. Cold-cycle the TV (power off + unplug ~10s + replug) to boot the new firmware."
echo "    Rollback: TV_HOST=$TV_HOST ./installer/uninstall.sh"
