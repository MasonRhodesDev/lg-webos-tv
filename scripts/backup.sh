#!/usr/bin/env bash
# Read-only backup of a rooted LG webOS TV over SSH.
#
# Usage: scripts/backup.sh OUTPUT_DIR [phase ...]
#   phases: runtime settings files images manifest   (default: all, in that order)
#
# Environment (or .env next to the repo root):
#   TV_HOST      required, the TV's address
#   TV_USER      optional, default root (needs root for block devices)
#   FORCE=1      re-capture items that already exist and verified
#   RW_RETRIES   extra attempts for an rw-mounted partition that changed
#                while it was being read (default 2; skipped above 1 GiB)
#   FULL_MEDIA=1 tar all of /media (default: only if the /media partition
#                image is inconsistent; /media/developer is always tarred)
#   MAX_LOAD     stop before a block read if the TV's 1-min load is above
#                this (default 16); PAUSE_SEC between reads (default 5)
#   MAX_GAP_MIB  refuse to image an unpartitioned gap bigger than this
#                (default 64); a big "gap" means the partition table is wrong
#
# Interrupting a run: busybox tee on the TV ignores SIGPIPE, so a remote read
# keeps going to the end of the device after the local side dies. Every block
# read is therefore wrapped in a TV-side timeout sized for ~2 MB/s, and each
# read waits until no other dd of the eMMC is running on the TV.
#
# Nothing is written on the TV: every remote command only reads, and all
# output streams back over ssh into OUTPUT_DIR. The output contains secrets
# (serials, MACs, Wi-Fi PSK, tokens, keys). Keep it out of git.
set -euo pipefail

usage() { sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'; exit "${1:-0}"; }
[ $# -ge 1 ] || usage 1
case "$1" in -h|--help) usage 0 ;; esac

OUT=$1; shift
PHASES=${*:-runtime settings files images manifest}

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ -z "${TV_HOST:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO_ROOT/.env"; set +a
fi
: "${TV_HOST:?set TV_HOST (env or .env)}"
TV_USER=${TV_USER:-root}
FORCE=${FORCE:-0}
RW_RETRIES=${RW_RETRIES:-2}
FULL_MEDIA=${FULL_MEDIA:-0}
MAX_GAP_MIB=${MAX_GAP_MIB:-64}
MAX_LOAD=${MAX_LOAD:-16}
PAUSE_SEC=${PAUSE_SEC:-5}

for t in ssh sha256sum jq awk; do
  command -v "$t" >/dev/null || { echo "missing local tool: $t" >&2; exit 1; }
done

umask 077
mkdir -p "$OUT"
chmod 700 "$OUT"
OUT=$(cd "$OUT" && pwd)
LEDGER="$OUT/.tvhash.tsv"   # relpath <TAB> tv-side hash <TAB> algo <TAB> note
touch "$LEDGER"
LOG="$OUT/backup.log"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

SSH_OPTS=(-o BatchMode=yes -o LogLevel=ERROR -o Compression=no -o ServerAliveInterval=30)
tv()   { ssh -n "${SSH_OPTS[@]}" "$TV_USER@$TV_HOST" "$@"; }  # -n: never eat the caller's stdin (while-read loops)
# luna-send prints nothing without a TTY; a pty turns \n into \r\n.
tvtty() { ssh -tt "${SSH_OPTS[@]}" "$TV_USER@$TV_HOST" "$@" </dev/null | tr -d '\r'; }

ledger_set() { # relpath hash algo note
  local tmp="$LEDGER.tmp"
  awk -F'\t' -v p="$1" '$1 != p' "$LEDGER" > "$tmp" || true
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$tmp"
  mv "$tmp" "$LEDGER"
}
ledger_get() { awk -F'\t' -v p="$1" '$1 == p {print $'"${2:-2}"'}' "$LEDGER"; }

# ---- remote capabilities --------------------------------------------------
probe() {
  local caps
  caps=$(tv 'for c in sha256sum md5sum ionice nice timeout tar; do command -v $c >/dev/null 2>&1 && echo $c; done
             timeout -t 1 true >/dev/null 2>&1 && echo busybox-timeout
             tar --version 2>/dev/null | grep -q GNU && echo gnu-tar; true')
  if grep -qx sha256sum <<<"$caps"; then HASH=sha256sum; else HASH=md5sum; fi
  NICE=""
  grep -qx nice <<<"$caps" && NICE="nice -n 19"
  grep -qx ionice <<<"$caps" && NICE="$NICE ionice -c 2 -n 7"
  if grep -qx busybox-timeout <<<"$caps"; then TMO="timeout -t"; else TMO="timeout"; fi
  if grep -qx gnu-tar <<<"$caps"; then
    TAR_OPTS="-cpf - --numeric-owner --ignore-failed-read"; XDEV="--one-file-system"
  else
    TAR_OPTS="-cf -"; XDEV=""
  fi
  log "remote: hash=$HASH nice='$NICE' timeout='$TMO' tar='$TAR_OPTS'"
}

local_hash() { if [ "$HASH" = sha256sum ]; then sha256sum "$1"; else md5sum "$1"; fi | awk '{print $1}'; }

# Stream a remote command's stdout into a local file while the TV hashes the
# same bytes in the same pass (tee to fd 3 = ssh stdout, hash to stderr).
# Usage: capture RELPATH 'remote command producing data'
# Prints the TV-side hash; the remote stderr (minus the hash) goes to RELPATH.err.
capture() {
  local rel=$1 cmd=$2 dst="$OUT/$1" errf tvh
  mkdir -p "$(dirname "$dst")"
  errf="$dst.err"
  tv "{ { $cmd; } | tee /proc/self/fd/3 | $HASH >&2; } 3>&1" > "$dst.part" 2> "$errf"
  tvh=$(grep -Eo '^[0-9a-f]{32,64}  -$' "$errf" | tail -1 | awk '{print $1}')
  sed -i -E '/^[0-9a-f]{32,64}  -$/d' "$errf"
  [ -s "$errf" ] || rm -f "$errf"
  mv "$dst.part" "$dst"
  printf '%s' "$tvh"
}

verify_and_record() { # relpath tvhash note
  local lh
  lh=$(local_hash "$OUT/$1")
  if [ -n "$2" ] && [ "$lh" = "$2" ]; then
    ledger_set "$1" "$2" "$HASH" "${3:-}"
    log "ok   $1 ($HASH match${3:+, $3})"
  else
    ledger_set "$1" "${2:-none}" "$HASH" "MISMATCH local=$lh ${3:-}"
    log "FAIL $1 tv=${2:-none} local=$lh"
  fi
}

already_done() { # relpath -> 0 if present and recorded as matched
  [ "$FORCE" = 1 ] && return 1
  [ -f "$OUT/$1" ] || return 1
  local h; h=$(ledger_get "$1")
  [ -n "$h" ] && [ "$h" != none ] && [ "$(local_hash "$OUT/$1")" = "$h" ]
}

# ---- runtime snapshot -----------------------------------------------------
phase_runtime() {
  local d="$OUT/runtime"; mkdir -p "$d"
  log "runtime snapshot"
  # /var/log is a ramfs under /tmp. If a later mount (for example a manual
  # overlay on /) hides it, reach the original through the cwd of a daemon
  # that sits inside it (crashd keeps its cwd in var/log/crashd). Read only.
  local LOGDIR_SH='L=/var/log; [ -e $L/bootd.log ] || for p in /proc/[0-9]*; do c=$(readlink $p/cwd 2>/dev/null); case "$c" in */var/log/*) [ -e $p/cwd/../bootd.log ] && { L=$p/cwd/..; break; };; esac; done'
  local -a items=(
    "proc_mounts.txt|cat /proc/mounts"
    "proc_self_mountinfo.txt|cat /proc/self/mountinfo"
    "proc_cmdline.txt|cat /proc/cmdline"
    "proc_partitions.txt|cat /proc/partitions"
    "partition_offsets.tsv|cd /sys/block/mmcblk0 && echo 'name	start_sector	size_sectors	partname' && for p in mmcblk0p*; do printf '%s\t%s\t%s\t%s\n' \$p \$(cat \$p/start) \$(cat \$p/size) \"\$(grep PARTNAME \$p/uevent | cut -d= -f2)\"; done; echo; echo disk_size_sectors \$(cat size)"
    "blockdev_stat.txt|for s in /sys/block/mmcblk0/stat /sys/block/mmcblk0/mmcblk0p*/stat; do echo \"\$s \$(cat \$s)\"; done"
    "mmc_info.txt|for f in /sys/block/mmcblk0/device/*; do [ -f \$f ] && echo \"\$(basename \$f): \$(cat \$f 2>/dev/null | head -c 200)\"; done; for b in mmcblk0boot0 mmcblk0boot1; do echo \$b force_ro=\$(cat /sys/block/\$b/force_ro 2>/dev/null) ro=\$(cat /sys/block/\$b/ro 2>/dev/null); done"
    "emmc_cid.txt|cat /sys/block/mmcblk0/device/cid"
    "emmc_csd.txt|cat /sys/block/mmcblk0/device/csd"
    "emmc_ext_csd.txt|for f in /sys/kernel/debug/mmc0/mmc0:*/ext_csd; do [ -r \$f ] && cat \$f || echo 'ext_csd: not readable (debugfs not mounted; not mounting it)'; done"
    "proc_partinfo.txt|cat /proc/partinfo"
    "uname.txt|uname -a"
    "uptime_loadavg.txt|uptime; cat /proc/loadavg; date -u"
    "lsmod.txt|lsmod 2>/dev/null || cat /proc/modules"
    "initctl_list.txt|initctl list"
    "ps.txt|ps -eo pid,ppid,user,etime,stat,args 2>/dev/null || ps w"
    "netstat_ltun.txt|netstat -ltun"
    "ip_addr.txt|ip addr 2>/dev/null || ifconfig -a"
    "df.txt|df -k / /var /home /media 2>/dev/null; true"
    "starfish-release.txt|cat /etc/starfish-release"
    "os-release.txt|cat /etc/os-release /etc/webos_release 2>/dev/null; true"
    "bootd.log|$LOGDIR_SH; cat \$L/bootd.log"
    "messages.log|$LOGDIR_SH; cat \$L/messages"
    "logdir_listing.txt|$LOGDIR_SH; echo logdir=\$L; ls -lan \$L/"
    "ls-lR_etc_init.txt|ls -lnR /etc/init"
    "ls-lR_etc_configd.txt|ls -lnR /etc/configd"
    "ls-lnR_var_luna_preferences.txt|ls -lnR /var/luna/preferences"
    "ls-lnR_var_lib_rootfs_upper.txt|ls -lnR /var/lib/rootfs_upper /var/lib/rootfs_work 2>&1"
    "ls-lnR_home.txt|ls -lnR /home"
    "ls-lnR_media_developer.txt|ls -lnR /media/developer"
  )
  local it name cmd h
  for it in "${items[@]}"; do
    name=${it%%|*}; cmd=${it#*|}
    h=$(capture "runtime/$name" "( $cmd ) 2>&1; true") || true
    verify_and_record "runtime/$name" "$h" >/dev/null 2>&1 || true
  done
  h=$(capture runtime/var_run_nyx.tar "tar $TAR_OPTS -C /var/run/nyx/ .")
  verify_and_record runtime/var_run_nyx.tar "$h"
  h=$(capture runtime/var_log.tar "$LOGDIR_SH; tar $TAR_OPTS -C \$L/ .")
  verify_and_record runtime/var_log.tar "$h"
  log "runtime snapshot done"
}

# ---- luna settings (reads only) ------------------------------------------
luna() { # outfile uri payload [appid]  (payload must not contain single quotes)
  # A borrowed appId is allowed only for read-only methods.
  if [ -n "${4:-}" ]; then
    case "${2##*/}" in
      find|get*|list*|search|*Status|query) ;;
      *) echo "refusing borrowed appId for non-read method: $2" >&2; return 1 ;;
    esac
  fi
  local a=""
  [ -n "${4:-}" ] && a="-a $4"
  tvtty "$TMO 20 luna-send -n 1 $a '$2' '$3'" > "$1.tmp" || true
  if jq . "$1.tmp" > "$1" 2>/dev/null; then rm -f "$1.tmp"; else mv "$1.tmp" "$1"; fi
}

phase_settings() {
  local d="$OUT/settings"; mkdir -p "$d/system"
  log "luna settings"
  # Categories come from the settings description map shipped in the rootfs.
  tv 'cat /etc/palm/description.categorykeysmap.json' > "$d/categorykeysmap.json"
  local cats
  cats=$(jq -r '.[].category' "$d/categorykeysmap.json" | sort -u)
  local c f
  while IFS= read -r c; do
    f="$d/system/category_${c:-_root}.json"
    if [ -n "$c" ]; then
      luna "$f" luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"$c\"}"
    fi
    # Ask for the listed keys explicitly too: some keys are omitted from a
    # category-only query.
    local keys
    keys=$(jq -c --arg c "$c" '[.[] | select(.category == $c) | .keys[]] | unique' "$d/categorykeysmap.json")
    if [ -n "$c" ]; then
      luna "${f%.json}.keys.json" luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"$c\",\"keys\":$keys}"
    else
      luna "${f%.json}.keys.json" luna://com.webos.settingsservice/getSystemSettings "{\"keys\":$keys}"
    fi
  done <<<"$cats"

  luna "$d/preloadPolicy.json"   luna://com.webos.service.preloadmanager/getPreloadPolicy '{}'
  # configd only takes "<namespace>.*" wildcards; namespaces are the layer file names.
  local cfgnames
  cfgnames=$(tv 'find /etc/configd/layers -name "*.json"' | sed 's,.*/,,; s,\.json$,,' | sort -u \
    | jq -Rnc '[inputs | select(length > 0) | . + ".*"]')
  luna "$d/configs.json"         luna://com.webos.service.config/getConfigs "{\"configNames\":$cfgnames}"
  luna "$d/systemInfo.json"      luna://com.webos.service.tv.systemproperty/getSystemInfo \
    '{"keys":["modelName","firmwareVersion","sdkVersion","boardType","UHD","_3d","otaId","hardwareVersion","serialNumber"]}'
  luna "$d/eim_allInputStatus.json"  luna://com.webos.service.eim/getAllInputStatus '{}'
  luna "$d/bt_adapter_status.json"   luna://com.webos.service.bluetooth2/adapter/getStatus '{}'
  luna "$d/bt_device_status.json"    luna://com.webos.service.bluetooth2/device/getStatus '{}'
  luna "$d/connman_status.json"      luna://com.webos.service.connectionmanager/getStatus '{}'
  luna "$d/wifi_profiles.json"       luna://com.webos.service.wifi/getprofilelist '{}'
  luna "$d/apps_listApps.json"       luna://com.webos.applicationManager/listApps '{}'
  luna "$d/apps_listLaunchPoints.json" luna://com.webos.applicationManager/listLaunchPoints '{}'

  # Full settings store from db8 (every input/picture-mode dimension), paged.
  # db8 refuses an anonymous caller, so this read-only find borrows the
  # settings service's appId (-a). Borrowed appIds are only ever used for
  # find/get/list/status calls, never for anything that changes state, and
  # each use is logged.
  local kind page n q borrow=com.webos.settingsservice
  mkdir -p "$d/db8"
  for kind in com.webos.settings.system:1 com.webos.settings.default:1 com.webos.settings.desc.system:1; do
    log "luna: borrowed appId $borrow for read-only db8 find on $kind (db8 denies anonymous reads of settings kinds)"
    page=""; n=0
    while :; do
      if [ -n "$page" ]; then
        q="{\"query\":{\"from\":\"$kind\",\"limit\":500,\"page\":\"$page\"}}"
      else
        q="{\"query\":{\"from\":\"$kind\",\"limit\":500}}"
      fi
      f="$d/db8/${kind%:1}.page$n.json"
      luna "$f" luna://com.webos.service.db/find "$q" "$borrow"
      page=$(jq -r '.next // empty' "$f" 2>/dev/null || true)
      n=$((n + 1))
      [ -n "$page" ] && [ "$n" -lt 100 ] || break
    done
  done
  # Settings are not hashed on the TV (they are generated output); record as local-only.
  local rel
  while IFS= read -r rel; do
    ledger_set "$rel" none "$HASH" "luna output (no TV-side file)"
  done < <(cd "$OUT" && find settings -type f ! -name categorykeysmap.json | sort)
  h=$(tv "$HASH /etc/palm/description.categorykeysmap.json" | awk '{print $1}')
  verify_and_record settings/categorykeysmap.json "$h"
  log "luna settings done"
}

# ---- file-level tars of rw areas -----------------------------------------
tar_area() { # relname 'paths' [xdev=1|0]
  local rel="files/$1.tar" h
  if already_done "$rel"; then log "skip $rel (verified)"; return; fi
  log "tar $2 -> $rel"
  local x="$XDEV"; [ "${3:-1}" = 1 ] || x=""
  h=$(capture "$rel" "$NICE tar $TAR_OPTS $x $2")
  verify_and_record "$rel" "$h" "live tar"
}

phase_files() {
  mkdir -p "$OUT/files"
  # Only paths visible in this mount namespace; --one-file-system keeps
  # tmpfs/squashfs submounts out. Partition images cover what is hidden.
  local -a areas=(
    "var|/var"
    "home|/home"
    "media_developer|/media/developer"
  )
  local mp
  # Whole-filesystem copies of the rw partitions where their root is mounted
  # (p52 root = cmn_data, which also holds var/ and home/; p51 root = db8).
  # Mounts that share a device+root with one already listed are skipped.
  local seen="" key
  for mp in /mnt/lg/cmn_data /mnt/lg/user /mnt/lg/flash/data /mnt/lg/db8 /mnt/lg/uhdcp /mnt/lg/ciplus/authcxt; do
    key=$(tv "awk -v m=$mp '\$5 == m {print \$3 \":\" \$4}' /proc/self/mountinfo | tail -1")
    if [ -n "$key" ] && grep -qxF "$key" <<<"$seen"; then
      log "note: $mp is the same filesystem root as an earlier area; skipped"; continue
    fi
    seen=$(printf '%s\n%s' "$seen" "$key")
    if tv "[ -n \"\$(ls -A $mp 2>/dev/null | grep -v '^temp\$\\|^epg\$')\" ]"; then
      areas+=("$(echo "${mp#/}" | tr / _)|$mp")
    else
      log "note: $mp empty or hidden in this mount namespace; covered by its partition image only"
    fi
  done
  local a
  for a in "${areas[@]}"; do tar_area "${a%%|*}" "${a#*|}"; done
  # /etc as seen live, including bind mounts over hosts/motd/passwd.
  tar_area etc_live /etc 0
  if [ "$FULL_MEDIA" = 1 ]; then tar_area media /media; fi
}

# ---- raw block images -----------------------------------------------------
part_writes() { tv "awk '{print \$7}' /sys/block/mmcblk0/$1/stat 2>/dev/null || echo 0"; }
is_rw_mounted() { tv "grep -q '^/dev/$1 [^ ]* [^ ]* rw' /proc/mounts"; }

# Wait (bounded) until no dd of the eMMC runs on the TV: ours from an earlier
# interrupted run, or another reader's. Fails if the TV stops answering.
wait_tv_idle() {
  local i load
  sleep "$PAUSE_SEC"
  load=$(tv 'cut -d" " -f1 /proc/loadavg') || { log "TV not answering; stopping"; exit 3; }
  if awk -v l="$load" -v m="$MAX_LOAD" 'BEGIN{exit !(l > m)}'; then
    log "TV 1-min load $load > $MAX_LOAD; stopping (re-run later; verified items are skipped)"; exit 3
  fi
  for i in $(seq 1 40); do
    if ! tv 'ps -eo args 2>/dev/null | grep -q "^dd if=/dev/mmcblk"'; then
      tv true || { log "TV not answering; stopping"; exit 3; }
      return 0
    fi
    [ "$i" = 1 ] && log "another eMMC read is running on the TV; waiting"
    sleep 15
  done
  log "eMMC still busy after 10 min; stopping"; exit 3
}

image_dev() { # devname relpath expected_bytes ddargs
  local dev=$1 rel=$2 bytes=$3 ddargs=${4:-bs=1M} h w0 w1 note rw=0 tries=0 got tmo
  if already_done "$rel" && [ "$(ledger_get "$rel" 4 | grep -c INCONSISTENT)" = 0 ]; then
    log "skip $rel (verified)"; return
  fi
  tmo=$((bytes / 2000000 + 120))
  wait_tv_idle
  is_rw_mounted "$dev" && rw=1
  while :; do
    w0=$(part_writes "$dev")
    log "dd /dev/$dev ($bytes bytes)${rw:+ rw=$rw} -> $rel"
    h=$(capture "$rel" "$TMO $tmo $NICE dd if=/dev/$dev $ddargs")
    w1=$(part_writes "$dev")
    got=$(stat -c %s "$OUT/$rel")
    note="ro-or-unmounted"
    if [ "$rw" = 1 ]; then
      if [ "$w0" = "$w1" ]; then note="rw-mounted, consistent (0 sectors written during read)"
      else note="rw-mounted, INCONSISTENT ($((w1 - w0)) sectors written during read)"; fi
    fi
    [ "$got" = "$bytes" ] || note="$note, SIZE MISMATCH got=$got want=$bytes"
    verify_and_record "$rel" "$h" "$note"
    case "$note" in
      *INCONSISTENT*)
        tries=$((tries + 1))
        if [ "$tries" -le "$RW_RETRIES" ] && [ "$bytes" -le $((1024 * 1024 * 1024)) ]; then
          log "retry $rel ($tries/$RW_RETRIES)"; continue
        fi ;;
    esac
    break
  done
}

phase_images() {
  mkdir -p "$OUT/images"
  local table="$OUT/images/partition_table.tsv"
  tv 'cd /sys/block/mmcblk0 && for p in mmcblk0p*; do printf "%s\t%s\t%s\n" $p $(cat $p/start) $(cat $p/size); done; echo "disk	0	$(cat size)"' \
    | sort -t$'\t' -k2,2n > "$table"
  local disk_sectors
  disk_sectors=$(awk -F'\t' '$1=="disk"{print $3}' "$table")

  # Images are named by physical start sector: an A/B flip swaps the partinfo
  # entries, so after an update or revert the same pN points at the other
  # physical region. Restore by offset, never by pN.
  pimg() { printf 'images/s%08d_%s.img' "$2" "$1"; }

  # partinfo (p2), mapbak (p3) and crc32info (p9) only make sense as a matched
  # set: read them back to back, with /proc/partinfo and their write counters
  # before and after, so a flip in the middle would show.
  local trio_w0 trio_w1 pi0 pi1 name start size
  tv 'cat /proc/partinfo' > "$OUT/images/proc_partinfo.before.txt"
  trio_w0=$(tv 'for n in 2 3 9; do awk "{print \$7}" /sys/block/mmcblk0/mmcblk0p$n/stat; done' | tr '\n' ' ')
  for name in mmcblk0p2 mmcblk0p3 mmcblk0p9; do
    start=$(awk -F'\t' -v n="$name" '$1==n{print $2}' "$table")
    size=$(awk -F'\t' -v n="$name" '$1==n{print $3}' "$table")
    [ -n "$start" ] || continue
    FORCE=1 image_dev "$name" "$(pimg "$name" "$start")" $((size * 512))
  done
  trio_w1=$(tv 'for n in 2 3 9; do awk "{print \$7}" /sys/block/mmcblk0/mmcblk0p$n/stat; done' | tr '\n' ' ')
  tv 'cat /proc/partinfo' > "$OUT/images/proc_partinfo.after.txt"
  pi0=$(sha256sum < "$OUT/images/proc_partinfo.before.txt"); pi1=$(sha256sum < "$OUT/images/proc_partinfo.after.txt")
  if [ "$trio_w0" = "$trio_w1" ] && [ "$pi0" = "$pi1" ]; then
    echo "matched: p2/p3/p9 read back to back; no writes to them and /proc/partinfo unchanged across the read" > "$OUT/images/partinfo_trio.txt"
  else
    echo "NOT MATCHED: writes before=[$trio_w0] after=[$trio_w1] partinfo_changed=$([ "$pi0" = "$pi1" ] && echo no || echo yes)" > "$OUT/images/partinfo_trio.txt"
  fi
  log "partinfo trio: $(cat "$OUT/images/partinfo_trio.txt")"

  # Whole-disk head and tail.
  image_dev mmcblk0 images/mmcblk0_head_8MiB.img $((8 * 1024 * 1024)) "bs=1M count=8"
  image_dev mmcblk0 images/mmcblk0_tail_8MiB.img $((8 * 1024 * 1024)) \
    "bs=512 skip=$((disk_sectors - 16384)) count=16384"

  # Every partition in physical order, one at a time.
  while IFS=$'\t' read -r name start size; do
    [ "$name" = disk ] && continue
    case "$name" in mmcblk0p2|mmcblk0p3|mmcblk0p9) continue ;; esac
    image_dev "$name" "$(pimg "$name" "$start")" $((size * 512))
  done < <(awk -F'\t' '$1!="disk"' "$table" | sort -t$'\t' -k2,2n)

  # Unpartitioned gaps.
  local prev_end=0 gi=0
  while IFS=$'\t' read -r name start size; do
    [ "$name" = disk ] && continue
    if [ "$start" -gt "$prev_end" ]; then
      if [ $(((start - prev_end) / 2048)) -gt "$MAX_GAP_MIB" ]; then
        log "refusing gap at sector $prev_end of $((start - prev_end)) sectors (> ${MAX_GAP_MIB} MiB)"; exit 4
      fi
      image_dev mmcblk0 "images/gap_${prev_end}_$((start - prev_end)).img" $(((start - prev_end) * 512)) \
        "bs=512 skip=$prev_end count=$((start - prev_end))"
      gi=$((gi + 1))
    fi
    [ $((start + size)) -gt "$prev_end" ] && prev_end=$((start + size))
  done < <(awk -F'\t' '$1!="disk"' "$table" | sort -t$'\t' -k2,2n)
  if [ "$prev_end" -lt "$disk_sectors" ]; then
    if [ $(((disk_sectors - prev_end) / 2048)) -gt "$MAX_GAP_MIB" ]; then
      log "refusing trailing gap at sector $prev_end (> ${MAX_GAP_MIB} MiB)"; exit 4
    fi
    image_dev mmcblk0 "images/gap_${prev_end}_$((disk_sectors - prev_end)).img" \
      $(((disk_sectors - prev_end) * 512)) "bs=512 skip=$prev_end count=$((disk_sectors - prev_end))"
  fi
  log "gaps between partitions: $gi"

  # eMMC hardware boot partitions (plain reads).
  local b sz
  for b in mmcblk0boot0 mmcblk0boot1; do
    sz=$(tv "cat /sys/block/$b/size 2>/dev/null || echo 0")
    [ "$sz" -gt 0 ] && image_dev "$b" "images/$b.img" $((sz * 512))
  done
  # RPMB is authenticated storage; a plain block read normally fails. Try one
  # sector only and record the outcome; never use the RPMB ioctl path.
  if tv 'dd if=/dev/mmcblk0rpmb bs=512 count=1 2>/dev/null | wc -c' > "$OUT/images/mmcblk0rpmb.probe" 2>&1 \
     && [ "$(tr -d ' \n' < "$OUT/images/mmcblk0rpmb.probe")" = 512 ]; then
    log "rpmb: plain read returned data; not imaging it (authenticated store, see docs)"
  else
    log "rpmb: plain read returned no data; not captured"
  fi

  # If the /media partition image changed during the read, take a file-level copy.
  local media_dev
  media_dev=$(tv "awk '\$2==\"/media\"{print \$1}' /proc/mounts | head -1 | sed 's,/dev/,,'")
  if [ -n "$media_dev" ] && awk -F'\t' -v d="_$media_dev.img" 'index($1, d) && $4 ~ /INCONSISTENT/' "$LEDGER" | grep -q .; then
    log "$media_dev image inconsistent; tarring /media"
    tar_area media /media
  fi
}

# ---- manifest ---------------------------------------------------------------
phase_manifest() {
  local m="$OUT/MANIFEST.txt" rel size lh th note match
  log "manifest"
  {
    echo "# Backup manifest, generated $(date -u +%FT%TZ)"
    echo "# columns: size_bytes  sha256(local)  tv_match  path  [note]"
    echo "# tv_match: yes = TV-side $HASH of the streamed bytes equals the local file;"
    echo "#           n/a = generated locally (luna output, logs); NO = mismatch"
    while IFS= read -r rel; do
      size=$(stat -c %s "$OUT/$rel")
      lh=$(sha256sum "$OUT/$rel" | awk '{print $1}')
      th=$(ledger_get "$rel"); note=$(ledger_get "$rel" 4)
      if [ -z "$th" ] || [ "$th" = none ]; then match=n/a
      elif [ "$HASH" = sha256sum ] && [ "$th" = "$lh" ]; then match=yes
      elif [ "$HASH" = md5sum ] && [ "$(md5sum "$OUT/$rel" | awk '{print $1}')" = "$th" ]; then match=yes-md5
      else match=NO; fi
      printf '%s  %s  %s  %s%s\n' "$size" "$lh" "$match" "$rel" "${note:+  [$note]}"
    done < <(cd "$OUT" && find . -type f ! -name MANIFEST.txt ! -name '.tvhash.tsv*' ! -name backup.log -printf '%P\n' | sort)
  } > "$m"
  log "manifest: $(grep -vc '^#' "$m") files, $(grep -c '  NO  ' "$m" || true) mismatches"
}

if [ "$PHASES" = manifest ]; then
  # Offline: take the hash algorithm from the ledger, no ssh needed.
  HASH=$(awk -F'\t' 'NF >= 3 {print $3; exit}' "$LEDGER"); HASH=${HASH:-sha256sum}
else
  probe
fi
for p in $PHASES; do
  case "$p" in
    runtime|settings|files|images|manifest) "phase_$p" ;;
    *) echo "unknown phase: $p" >&2; exit 2 ;;
  esac
done
log "done: $OUT"
