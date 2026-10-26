#!/bin/sh
# telemetry-off: switch off LG telemetry, ads, ACR and voice uploads on a
# rooted webOS TV 4.x, down to the running services.
#
# Installed by install.sh as a Homebrew Channel init.d hook
# (/var/lib/webosbrew/init.d/80-telemetry-off). run-parts calls it with no
# arguments at the end of HBC's startup.sh, about 35 s after power-on.
#
# Usage: telemetry-off [apply|--dry-run|revert|enable|status]
#   apply      (default) blackhole hosts, block targets (see below),
#              re-assert settings, wipe buffers
#   --dry-run  print exactly what apply would do; writes nothing
#   revert     undo everything this script did, without a reboot, and set
#              the off switch so the next boot stays a no-op
#   enable     clear the off switch (takes effect at the next boot or apply)
#   status     print the recorded state
#
# Off switch: if $TO_DIR/disabled exists, apply is a no-op.
#
# Safe failure. HBC enters failsafe mode on the next boot if the TV dies
# while startup.sh runs, so this script:
#   - never uses set -e; every step runs in its own subshell and a failing
#     step is logged and skipped;
#   - never touches dropbear, SSH, connman, Wi-Fi or any network interface;
#   - bounds every luna-send with a timeout;
#   - marks a run in progress, and if a previous run never finished (the TV
#     died mid-apply), sets the off switch instead of trying again.
#
# How targets are blocked depends on how they start (targets.tsv):
#   upstart job       bind-mount a stub over the binary, then initctl stop
#   ls-hubd on demand bind-mount an empty file over every copy of its
#                     .service file, SIGHUP ls-hubd to rescan, then kill the
#                     running instance. Calls then fail with "Service does not
#                     exist" at once. (A binary stub here would make every
#                     caller hang for LaunchTimeout, 300 s.)
# Running copies are found by exact /proc/PID/exe path, the method used by
# Life's Good Without Spying (MIT, (c) 2026 Lewis Wood,
# https://github.com/lewisdoesstuff/lifesgoodwithoutspying, nospy-lib.sh).
# The hub-mask-and-rescan method and the target list are this firmware's.
#
# securitymanager is replaced with a sleeping stub (group "sm"). That turns
# off runtime partition verification (sb_verify_task) and the
# com.webos.service.sm API, including deviceid/getIDs (the IFAID ad ID).

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

TO_DIR=${TO_DIR:-/var/lib/telemetry-off}
CONF=$TO_DIR/telemetry-off.conf
DOMAIN_DIR=$TO_DIR/domains
TARGETS=$TO_DIR/targets.tsv
SETTINGS_FILE=$TO_DIR/settings.tsv
WIPE_FILE=$TO_DIR/wipe.list
STATE=$TO_DIR/state
OFF_FLAG=$TO_DIR/disabled
RUNNING=$STATE/applying
STUB=$STATE/stub
HOSTS_GEN=$STATE/hosts
EMPTY=$STATE/empty               # empty file bind-mounted over .service files
STUBBED=$STATE/stubbed.list       # one bind-mounted path per line (stubs and masks)
STOPPED=$STATE/stopped.list       # upstart jobs this script stopped
FLAGS_MADE=$STATE/flags.list      # LG flag files this script created
SETTINGS_ORIG=$STATE/settings.orig  # category<TAB>key<TAB>old value
EULA_ORIG=$STATE/eula.orig        # eulaStatus JSON before the change
LOG=${TO_LOG:-/var/log/telemetry-off.log}
MARKER="# telemetry-off: LG telemetry blackhole"
LUNA_SETTINGS=luna://com.webos.settingsservice

# Defaults; telemetry-off.conf overrides them.
DOMAIN_FILES="10-ads.txt 20-acr.txt 30-home-recommend.txt 40-telemetry.txt 45-sdp.txt 50-thinq.txt 55-voice.txt 60-lg-cdn.txt 70-quickset.txt 80-lgchannels.txt 90-updates.txt 95-connectivity-check.txt"
TARGET_GROUPS="acr ads sdp recommend diag voice thinq updates sm"
SETTINGS=1
EULA=1
EULA_KEYS="acrOnAllowed acrAdAllowed customAdAllowed additionalDataAllowed voiceAllowed voice2Allowed takeOnAllowed chpAllowed"
FLAGS=1
WIPE=1
LG_FLAG_FILES="/var/luna/preferences/crashreportd_disabled /var/luna/preferences/voice_server_sync_disabled"
SVC_DIRS="/usr/share/luna-service2/services.d /usr/share/dbus-1/services /usr/share/dbus-1/system-services"

DRY=0

# ---------------------------------------------------------------- helpers

log() { echo "$(date '+%F %T' 2>/dev/null) $*"; }

# act CMD...: run CMD, or in dry-run print it.
act() {
    if [ "$DRY" = 1 ]; then
        echo "  WOULD: $*"
        return 0
    fi
    "$@"
}

# step NAME FUNC: run FUNC in a subshell so an error or exit in it can never
# abort the rest of the run.
step() {
    name=$1; shift
    log "-- $name"
    ( "$@" )
    rc=$?
    [ "$rc" -eq 0 ] || log "!! step $name failed (rc=$rc); continuing"
    return 0
}

have() { command -v "$1" >/dev/null 2>&1; }

# Strip comments and blank lines.
data_lines() { [ -f "$1" ] && grep -v '^[[:space:]]*#' "$1" | grep -v '^[[:space:]]*$'; }

in_list() { # WORD LIST...
    w=$1; shift
    for x in $*; do [ "$x" = "$w" ] && return 0; done
    return 1
}

is_mountpoint_file() { awk -v p="$1" '$2 == p { f = 1 } END { exit !f }' /proc/mounts; }

# luna_get_json URI JSON: print the reply on one line. luna-send prints
# nothing without a TTY, so run it under script(1); /dev/null is the
# typescript, so nothing is written. Bounded by a 5 s timeout; a step stops
# at its first unanswered read (luna is not up yet).
luna() {
    out=$(cd / && timeout -t 5 script -q -c "luna-send -n 1 $1 '$2'" /dev/null </dev/null 2>/dev/null | tr -d '\r')
    rc=$?
    if [ -z "$out" ]; then
        log "   luna: no reply from $1 (rc=$rc)" >&2
        return 1
    fi
    echo "$out"
}

json_str() { # KEY < json: value of "KEY":"v" or "KEY":true/false
    sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p; t; s/.*\"$1\":\([a-z0-9]*\).*/\1/p" | head -n 1
}

load_conf() {
    # shellcheck disable=SC1090
    [ -f "$CONF" ] && . "$CONF"
    return 0
}

# targets.tsv rows in enabled groups:
# name group stub binary job service (tab-separated, "-" = none)
targets() {
    data_lines "$TARGETS" | while read -r name group stub bin job svc; do
        in_list "$group" $TARGET_GROUPS || continue
        printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$name" "$group" "$stub" "$bin" "$job" "$svc"
    done
}

# Every existing copy of a hub service file.
service_files() { # NAME
    for d in $SVC_DIRS; do
        [ -f "$d/$1.service" ] && echo "$d/$1.service"
    done
}

hub_pids() { pidof ls-hubd 2>/dev/null; }

# pid<SPACE>exe for every process, in one pass (ls -l on /proc/*/exe).
proc_exe_table() {
    ls -l /proc/[0-9]*/exe 2>/dev/null | awk '{
        t = ""; p = ""
        for (i = 1; i <= NF; i++) {
            if ($i == "->") t = $(i + 1)
            else if ($i ~ /^\/proc\/[0-9]+\/exe$/) p = $i
        }
        if (t == "" || p == "") next
        sub(/^\/proc\//, "", p); sub(/\/exe$/, "", p)
        print p, t
    }'
}

pids_for_paths() { # "newline-separated paths"; also matches jail copies
    proc_exe_table | awk -v list="$1" '
        BEGIN { n = split(list, a, "\n"); for (i = 1; i <= n; i++) if (a[i] != "") want[a[i]] = 1 }
        { e = $2; sub(/^\/var\/palm\/jail\/[^\/]+/, "", e) }
        ($2 in want) || (e in want) { print $1 }'
}

job_running() { initctl status "$1" 2>/dev/null | grep -q 'start/running'; }

# ------------------------------------------------------------------ steps

do_preflight() {
    missing=""
    for t in mount umount initctl awk sed grep timeout script luna-send ls; do
        have "$t" || missing="$missing $t"
    done
    [ -z "$missing" ] || { log "   missing tools:$missing"; exit 1; }
    [ -f /etc/hosts ] || { log "   /etc/hosts missing"; exit 1; }
    [ -f "$TARGETS" ] || { log "   $TARGETS missing"; exit 1; }
    rel=$(cat /etc/starfish-release 2>/dev/null)
    case "$rel" in
        *" 4."*) log "   firmware: $rel" ;;
        *) log "   WARNING: built for webOS TV 4.x, this is: ${rel:-unknown}; targets that do not exist are skipped" ;;
    esac
}

do_hosts() {
    # Remove only our own previous mount, leaving HBC's (or stock) beneath.
    n=0
    while grep -qF "$MARKER" /etc/hosts 2>/dev/null && [ "$n" -lt 3 ]; do
        act umount /etc/hosts || act umount -l /etc/hosts
        n=$((n + 1))
        [ "$DRY" = 1 ] && break
    done
    domains=$(for f in $DOMAIN_FILES; do
        if [ -f "$DOMAIN_DIR/$f" ]; then
            data_lines "$DOMAIN_DIR/$f"
        else
            log "   domain file missing: $f" >&2
        fi
    done | tr 'A-Z' 'a-z' | awk '!seen[$1]++ { print $1 }')
    count=$(echo "$domains" | grep -c .)
    if [ "$DRY" = 1 ]; then
        base=$(grep -vF "$MARKER" /etc/hosts | grep -c .)
        echo "  WOULD: write $HOSTS_GEN = current /etc/hosts ($base lines, HBC's entries kept) + $count names x 2 (0.0.0.0 and ::)"
        echo "  WOULD: mount --bind $HOSTS_GEN /etc/hosts"
        echo "  domain files: $DOMAIN_FILES"
        echo "  first names: $(echo "$domains" | head -n 5 | tr '\n' ' ')..."
        return 0
    fi
    [ "$count" -gt 0 ] || { log "   no domains; hosts left alone"; return 0; }
    {
        cat /etc/hosts
        echo ""
        echo "$MARKER ($count names, $(date '+%F %T' 2>/dev/null))"
        echo "$domains" | while read -r d; do
            [ -n "$d" ] || continue
            echo "0.0.0.0 $d"
            echo ":: $d"
        done
    } > "$HOSTS_GEN.new" && chmod 644 "$HOSTS_GEN.new" && mv "$HOSTS_GEN.new" "$HOSTS_GEN"
    if mount --bind "$HOSTS_GEN" /etc/hosts; then
        log "   /etc/hosts: $count names blackholed"
    else
        log "   bind mount over /etc/hosts failed"
        exit 1
    fi
    # Jails copy /etc/hosts once, when the jail is built. Report stale ones;
    # rewriting them is left to the jailer (stubs cover the jailed targets).
    for h in /var/palm/jail/*/etc/hosts; do
        [ -f "$h" ] || continue
        grep -qF "$MARKER" "$h" || log "   note: $h predates the blackhole (jail built earlier)"
    done
}

do_flags() {
    for f in $LG_FLAG_FILES; do
        [ -e "$f" ] && { echo "  present: $f"; continue; }
        if [ "$DRY" = 1 ]; then
            echo "  WOULD: create $f"
        else
            : > "$f" && echo "$f" >> "$FLAGS_MADE" && log "   created $f"
        fi
    done
}

do_stubs() {
    TAB=$(printf '\t')
    rows=$(targets)
    if [ "$DRY" = 1 ]; then
        echo "  WOULD: write stubs $STUB.exit (exit 0), $STUB.sleep (sleep forever), empty file $EMPTY"
    else
        printf '#!/bin/sh\n# telemetry-off stub\nexit 0\n' > "$STUB.exit" &&
        printf '#!/bin/sh\n# telemetry-off stub\nexec sleep 999999999\n' > "$STUB.sleep" &&
        chmod 755 "$STUB.exit" "$STUB.sleep" && : > "$EMPTY" || exit 1
    fi
    masked=0
    # 1. Upstart targets: stub the binary, so a later start (respawn, an
    #    instant-boot-done on a standby wake) runs the stub.
    # 2. Hub targets: blank every copy of the .service file.
    while IFS="$TAB" read -r name group stub bin job svc; do
        [ -n "$name" ] || continue
        if [ "$stub" != "-" ] && [ -f "$bin" ]; then
            if is_mountpoint_file "$bin"; then
                if head -n 2 "$bin" 2>/dev/null | grep -q 'telemetry-off stub'; then
                    echo "  already stubbed: $bin"
                else
                    echo "  SKIP (someone else's mount is on it): $bin"
                fi
            elif [ "$DRY" = 1 ]; then
                echo "  WOULD: mount --bind $STUB.$stub $bin    [$name, upstart job $job]"
            elif mount --bind "$STUB.$stub" "$bin"; then
                echo "$bin" >> "$STUBBED"
                log "   stubbed ($stub) $bin"
            else
                log "   stub mount failed: $bin"
            fi
        fi
        [ "$svc" = "-" ] && continue
        for f in $(service_files "$svc"); do
            if is_mountpoint_file "$f"; then
                if [ -s "$f" ]; then
                    echo "  SKIP (someone else's mount is on it): $f"
                else
                    echo "  already masked: $f"
                fi
            elif [ "$DRY" = 1 ]; then
                echo "  WOULD: mount --bind $EMPTY $f    [$name]"
                masked=1
            elif mount --bind "$EMPTY" "$f"; then
                echo "$f" >> "$STUBBED"
                masked=1
                log "   masked $f"
            else
                log "   mask failed: $f"
            fi
        done
    done <<EOF_T
$rows
EOF_T
    # 3. Make ls-hubd re-read its service dirs. SIGHUP is what
    #    `ls-control scan-services` sends; ls-control itself can wait forever.
    if [ "$masked" = 1 ]; then
        if [ "$DRY" = 1 ]; then
            echo "  WOULD: kill -HUP $(hub_pids)   (ls-hubd rescan)"
        else
            hp=$(hub_pids)
            [ -n "$hp" ] && kill -HUP $hp && log "   ls-hubd ($hp) rescan requested"
            sleep 2
        fi
    fi
    # 4. Stop upstart jobs (before killing, so a respawn job stays down).
    echo "$rows" | cut -f5 | grep -v '^-$' | grep . | while read -r job; do
        if job_running "$job"; then
            if [ "$DRY" = 1 ]; then
                echo "  WOULD: initctl stop $job    ($(initctl status "$job" 2>/dev/null))"
            else
                timeout -t 15 initctl stop "$job" >/dev/null 2>&1
                echo "$job" >> "$STOPPED"
                log "   stopped job $job"
            fi
        else
            echo "  job not running: $job"
        fi
    done
    # 5. Kill what still runs from the real binaries (hub-launched services
    #    have no job), matched by exact exe path, jail copies included.
    paths=$(echo "$rows" | cut -f4 | grep -v '^-$')
    pids=$(pids_for_paths "$paths" | tr '\n' ' ')
    if [ -n "$pids" ]; then
        if [ "$DRY" = 1 ]; then
            for pid in $pids; do
                echo "  WOULD: kill $pid ($(cat /proc/$pid/comm 2>/dev/null), parent $(awk '/^PPid:/{print $2}' /proc/$pid/status 2>/dev/null))"
            done
        else
            kill -TERM $pids 2>/dev/null
            sleep 2
            pids=$(pids_for_paths "$paths" | tr '\n' ' ')
            [ -n "$pids" ] && kill -KILL $pids 2>/dev/null
            log "   killed leftover target processes"
        fi
    else
        echo "  no target processes running from real binaries"
    fi
}

do_settings() {
    data_lines "$SETTINGS_FILE" | while read -r cat key want; do
        reply=$(luna "$LUNA_SETTINGS/getSystemSettings" "{\"category\":\"$cat\",\"keys\":[\"$key\"]}") || exit 1
        cur=$(echo "$reply" | json_str "$key")
        if [ "$cur" = "$want" ]; then
            echo "  ok: $cat.$key = $want"
            continue
        fi
        if [ "$DRY" = 1 ]; then
            echo "  WOULD: set $cat.$key: ${cur:-<unset>} -> $want"
            continue
        fi
        res=$(luna "$LUNA_SETTINGS/setSystemSettings" "{\"category\":\"$cat\",\"settings\":{\"$key\":\"$want\"}}")
        if echo "$res" | grep -q '"returnValue":true'; then
            grep -q "^$cat	$key	" "$SETTINGS_ORIG" 2>/dev/null ||
                printf '%s\t%s\t%s\n' "$cat" "$key" "$cur" >> "$SETTINGS_ORIG"
            log "   set $cat.$key: $cur -> $want"
        else
            log "   set $cat.$key failed: $res"
        fi
    done
}

do_eula() {
    reply=$(luna "$LUNA_SETTINGS/getSystemSettings" '{"keys":["eulaStatus"]}') || exit 1
    cur=$(echo "$reply" | sed -n 's/.*"eulaStatus":\({[^}]*}\).*/\1/p')
    [ -n "$cur" ] || { log "   eulaStatus not found in reply"; exit 1; }
    new=$cur
    changed=""
    for k in $EULA_KEYS; do
        case "$new" in
            *"\"$k\":true"*)
                new=$(echo "$new" | sed "s/\"$k\":true/\"$k\":false/")
                changed="$changed $k"
                ;;
        esac
    done
    if [ -z "$changed" ]; then
        echo "  ok: all of [$EULA_KEYS] already false"
        return 0
    fi
    if [ "$DRY" = 1 ]; then
        echo "  WOULD: set eulaStatus flags true -> false:$changed"
        echo "  (generalTermsAllowed, networkAllowed untouched)"
        return 0
    fi
    [ -f "$EULA_ORIG" ] || echo "$cur" > "$EULA_ORIG"
    res=$(luna "$LUNA_SETTINGS/setSystemSettings" "{\"settings\":{\"eulaStatus\":$new}}")
    if echo "$res" | grep -q '"returnValue":true'; then
        log "   eulaStatus withdrawn:$changed"
    else
        log "   eulaStatus write failed: $res"
    fi
}

do_wipe() {
    data_lines "$WIPE_FILE" | while read -r p; do
        if [ -d "$p" ]; then
            n=$(find "$p" -mindepth 1 2>/dev/null | wc -l)
            [ "$n" -gt 0 ] || continue
            if [ "$DRY" = 1 ]; then
                echo "  WOULD: empty $p ($n entries)"
            else
                find "$p" -mindepth 1 -maxdepth 1 -exec rm -rf {} \; 2>/dev/null
                log "   emptied $p ($n entries)"
            fi
        elif [ -e "$p" ]; then
            if [ "$DRY" = 1 ]; then
                echo "  WOULD: delete $p ($(wc -c < "$p" 2>/dev/null) bytes)"
            else
                rm -f "$p" 2>/dev/null && log "   deleted $p"
            fi
        fi
    done
}

# ----------------------------------------------------------------- revert

do_revert() {
    log "== revert"
    # Settings back to what they were.
    if [ -f "$SETTINGS_ORIG" ]; then
        while IFS="$(printf '\t')" read -r cat key old; do
            [ -n "$old" ] || continue
            luna "$LUNA_SETTINGS/setSystemSettings" "{\"category\":\"$cat\",\"settings\":{\"$key\":\"$old\"}}" >/dev/null &&
                log "   restored $cat.$key = $old"
        done < "$SETTINGS_ORIG"
        rm -f "$SETTINGS_ORIG"
    fi
    if [ -f "$EULA_ORIG" ]; then
        luna "$LUNA_SETTINGS/setSystemSettings" "{\"settings\":{\"eulaStatus\":$(cat "$EULA_ORIG")}}" >/dev/null &&
            log "   restored eulaStatus" && rm -f "$EULA_ORIG"
    fi
    # Unmount stubs and .service masks (only paths we recorded, and only
    # while our stub or empty mask is the top mount), then let ls-hubd rescan.
    if [ -f "$STUBBED" ]; then
        while read -r p; do
            [ -n "$p" ] || continue
            is_mountpoint_file "$p" || continue
            if head -n 2 "$p" 2>/dev/null | grep -q 'telemetry-off stub' ||
               { case "$p" in *.service) [ ! -s "$p" ] ;; *) false ;; esac; }; then
                umount "$p" 2>/dev/null || umount -l "$p" 2>/dev/null
                log "   unmounted $p"
            fi
        done < "$STUBBED"
        rm -f "$STUBBED"
        hp=$(hub_pids)
        [ -n "$hp" ] && kill -HUP $hp && log "   ls-hubd ($hp) rescan requested"
        sleep 2
    fi
    # Restart jobs we stopped. ls-hubd services come back on their next call.
    if [ -f "$STOPPED" ]; then
        sort -u "$STOPPED" | while read -r job; do
            [ -n "$job" ] || continue
            timeout -t 15 initctl start "$job" >/dev/null 2>&1 && log "   started job $job"
        done
        rm -f "$STOPPED"
    fi
    # hosts: only if ours is the top mount.
    n=0
    while grep -qF "$MARKER" /etc/hosts 2>/dev/null && [ "$n" -lt 3 ]; do
        umount /etc/hosts 2>/dev/null || umount -l /etc/hosts 2>/dev/null
        n=$((n + 1))
    done
    grep -qF "$MARKER" /etc/hosts 2>/dev/null || log "   /etc/hosts: ours removed"
    if [ -f "$FLAGS_MADE" ]; then
        while read -r f; do [ -n "$f" ] && rm -f "$f" && log "   removed $f"; done < "$FLAGS_MADE"
        rm -f "$FLAGS_MADE"
    fi
    : > "$OFF_FLAG"
    log "   off switch set ($OFF_FLAG); run '$0 enable' to re-arm"
    log "   not undone: wiped buffers (deleted files are gone)"
}

do_status() {
    echo "telemetry-off state ($TO_DIR)"
    [ -e "$OFF_FLAG" ] && echo "  OFF SWITCH SET: apply is a no-op"
    [ -e "$RUNNING" ] && echo "  WARNING: a run is marked in progress"
    grep -qF "$MARKER" /etc/hosts && echo "  hosts: ours on top ($(grep -c '^0\.0\.0\.0 ' /etc/hosts) names)" || echo "  hosts: not ours"
    echo "  stubs+masks: $(grep -c . "$STUBBED" 2>/dev/null || echo 0); stopped jobs: $(sort -u "$STOPPED" 2>/dev/null | grep -c .)"
    [ -f "$SETTINGS_ORIG" ] && { echo "  settings changed (old values):"; sed 's/^/    /' "$SETTINGS_ORIG"; }
    [ -f "$EULA_ORIG" ] && echo "  eulaStatus changed (original saved)"
    [ -f "$LOG" ] && { echo "  last log lines:"; tail -n 5 "$LOG" | sed 's/^/    /'; }
}

# ------------------------------------------------------------------- main

MODE=apply
case "${1:-}" in
    ""|apply) MODE=apply ;;
    --dry-run|dry-run|-n) MODE=apply; DRY=1 ;;
    revert|--revert) MODE=revert ;;
    enable) MODE=enable ;;
    status) MODE=status ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown mode: $1" >&2; exit 2 ;;
esac

load_conf

if [ "$MODE" = status ]; then do_status; exit 0; fi
if [ "$MODE" = enable ]; then rm -f "$OFF_FLAG" "$RUNNING"; echo "off switch cleared"; exit 0; fi

if [ "$DRY" = 1 ]; then
    echo "== telemetry-off --dry-run ($(date '+%F %T' 2>/dev/null)); nothing is written"
    [ -e "$OFF_FLAG" ] && echo "  note: off switch is set; a real boot run would do nothing"
else
    # The off switch is checked before anything else, including the log.
    [ -e "$OFF_FLAG" ] && [ "$MODE" = apply ] && exit 0
    mkdir -p "$STATE" 2>/dev/null
    if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 131072 ]; then
        tail -n 400 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
    fi
    exec >>"$LOG" 2>&1
fi

if [ "$MODE" = revert ]; then
    do_revert
    rm -f "$RUNNING"
    exit 0
fi

if [ "$DRY" != 1 ]; then
    if [ -e "$RUNNING" ]; then
        : > "$OFF_FLAG"
        log "== previous run never finished (TV died mid-apply?); off switch set, doing nothing"
        rm -f "$RUNNING"
        exit 0
    fi
    : > "$RUNNING"
    sync
    log "== apply (groups: $TARGET_GROUPS)"
fi

step preflight do_preflight
step hosts do_hosts
[ "$FLAGS" = 1 ] && step flags do_flags
step stubs do_stubs
[ "$SETTINGS" = 1 ] && step settings do_settings
[ "$EULA" = 1 ] && step eula do_eula
[ "$WIPE" = 1 ] && step wipe do_wipe

if [ "$DRY" = 1 ]; then
    echo "== dry run done"
else
    rm -f "$RUNNING"
    log "== done"
fi
exit 0
