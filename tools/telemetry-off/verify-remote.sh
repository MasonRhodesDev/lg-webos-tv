# verify-remote.sh: read-only probe, run on the TV by verify.sh (busybox sh).
# verify.sh prepends the data variables (TARGETS, LISTEN_ALLOW, SETTINGS,
# SENTINELS, EULA_KEYS, ALLOW_REMOTE). Prints lines starting OK / WARN /
# FAIL / INFO. Writes nothing: luna-send runs under script(1) with
# /dev/null as the typescript.
PATH=/usr/sbin:/usr/bin:/sbin:/bin
MARKER="# telemetry-off: LG telemetry blackhole"
ok() { echo "OK   $*"; }
warn() { echo "WARN $*"; }
fail() { echo "FAIL $*"; }
info() { echo "INFO $*"; }
luna() { (cd / && timeout -t 5 script -q -c "luna-send -n 1 $1 '$2'" /dev/null </dev/null 2>/dev/null | tr -d '\r'); }
in_words() { w=$1; shift; for x in $*; do [ "$x" = "$w" ] && return 0; done; return 1; }
mounted() { awk -v p="$1" '$2 == p { f = 1 } END { exit !f }' /proc/mounts; }

echo "== firmware: $(cat /etc/starfish-release 2>/dev/null); up $(cut -d' ' -f1 /proc/uptime)s"

echo "== kit state"
if [ -f /var/lib/webosbrew/init.d/80-telemetry-off ]; then ok "hook installed"; else fail "hook not installed (/var/lib/webosbrew/init.d/80-telemetry-off)"; fi
[ -e /var/lib/telemetry-off/disabled ] && fail "off switch is set (/var/lib/telemetry-off/disabled)"
[ -e /var/lib/telemetry-off/state/applying ] && fail "a run is marked in progress"
for f in /var/lib/webosbrew/init.d/*; do [ -f "$f" ] && info "init.d: $(basename "$f")"; done
[ -f /var/log/telemetry-off.log ] && info "last log: $(tail -n 1 /var/log/telemetry-off.log)"

echo "== processes"
exe_table=$(ls -l /proc/[0-9]*/exe 2>/dev/null | awk '{t="";p="";for(i=1;i<=NF;i++){if($i=="->")t=$(i+1);else if($i~/^\/proc\/[0-9]+\/exe$/)p=$i};if(t!=""&&p!=""){sub(/^\/proc\//,"",p);sub(/\/exe$/,"",p);print p, t}}')
echo "$TARGETS" | while read -r name stub bin job svc; do
    [ -n "$name" ] || continue
    if [ "$bin" != "-" ]; then
        pids=$(echo "$exe_table" | awk -v b="$bin" '$2 == b || $2 ~ ("^/var/palm/jail/[^/]+" b "$") { printf "%s ", $1 }')
        if [ -n "$pids" ]; then fail "running: $name ($bin) pid $pids"; else ok "not running: $name"; fi
    fi
    if [ "$stub" != "-" ] && [ -f "$bin" ]; then
        if mounted "$bin"; then
            if head -n 2 "$bin" 2>/dev/null | grep -q 'telemetry-off stub'; then ok "stubbed: $bin"
            else warn "bind mount over $bin is not ours: $(head -n 2 "$bin" 2>/dev/null | tr '\n' ' ')"; fi
        else
            fail "not stubbed: $bin"
        fi
    fi
    if [ "$svc" != "-" ]; then
        for d in /usr/share/luna-service2/services.d /usr/share/dbus-1/services /usr/share/dbus-1/system-services; do
            f=$d/$svc.service
            [ -f "$f" ] || continue
            if mounted "$f" && [ ! -s "$f" ]; then ok "masked: $f"; else fail "not masked: $f"; fi
        done
    fi
    if [ "$job" != "-" ]; then
        st=$(initctl status "$job" 2>/dev/null)
        case "$st" in *start/running*) fail "upstart job running: $st" ;; *) ok "job stopped: $job" ;; esac
    fi
done
for n in user-context-manager iconnectivity pbs WebAppMgr appinstalld connmand; do
    p=$(echo "$exe_table" | awk -v n="$n" '$2 ~ ("/" n "$") { printf "%s ", $1 }')
    [ -n "$p" ] && info "network-block-only service running: $n (pid $p)"
done

echo "== hosts"
if mounted /etc/hosts; then info "/etc/hosts is a mount"; else info "/etc/hosts is the stock file"; fi
if grep -qF "$MARKER" /etc/hosts; then
    ok "blackhole on top: $(grep -c '^0\.0\.0\.0 ' /etc/hosts) names"
else
    fail "telemetry-off blackhole not in /etc/hosts"
fi
for d in $SENTINELS; do
    if grep -q "^0\.0\.0\.0 $d\$\|^127\.0\.0\.1 .*\b$d\b" /etc/hosts; then ok "blocked: $d"; else fail "not blocked: $d"; fi
done
info "current entries other than the stock header:"
grep -v '^[[:space:]]*#' /etc/hosts | grep -v '^[[:space:]]*$' | grep -vE '^(127\.0\.0\.1[[:space:]]+localhost|::1[[:space:]]+localhost|fe00::0|ff00::0|ff02::)' |
    awk '{ n++; if (n <= 8) print "INFO   " $0 } END { if (n > 8) print "INFO   ... " n " lines" }'
for h in /var/palm/jail/*/etc/hosts; do
    [ -f "$h" ] || continue
    grep -qF "$MARKER" "$h" || warn "jail hosts lacks the blackhole (copied before it existed): $h"
done

echo "== settings"
echo "$SETTINGS" | while read -r cat key want; do
    [ -n "$cat" ] || continue
    r=$(luna luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"$cat\",\"keys\":[\"$key\"]}")
    cur=$(echo "$r" | sed -n "s/.*\"$key\":\"\([^\"]*\)\".*/\1/p")
    if [ -z "$r" ]; then warn "no luna reply for $cat.$key"
    elif [ "$cur" = "$want" ]; then ok "$cat.$key = $cur"
    else fail "$cat.$key = ${cur:-<unset>} (want $want)"; fi
done
r=$(luna luna://com.webos.settingsservice/getSystemSettings '{"keys":["eulaStatus"]}')
es=$(echo "$r" | sed -n 's/.*"eulaStatus":\({[^}]*}\).*/\1/p')
if [ -z "$es" ]; then warn "eulaStatus unreadable"
else
    for k in $EULA_KEYS; do
        case "$es" in *"\"$k\":true"*) fail "user agreement $k = true" ;; *"\"$k\":false"*) ok "user agreement $k = false" ;; *) info "user agreement $k absent" ;; esac
    done
    for k in generalTermsAllowed networkAllowed; do
        case "$es" in *"\"$k\":true"*) info "$k = true (left alone on purpose)" ;; esac
    done
fi
for f in /var/luna/preferences/crashreportd_disabled /var/luna/preferences/voice_server_sync_disabled; do
    if [ -e "$f" ]; then ok "flag present: $f"; else fail "flag missing: $f"; fi
done

echo "== clock"
r=$(luna luna://com.webos.service.systemservice/time/getSystemTime '{}')
src=$(echo "$r" | sed -n 's/.*"systemTimeSource":"\([^"]*\)".*/\1/p')
yr=$(date +%Y)
if [ "$yr" -ge "${MIN_YEAR:-2026}" ] 2>/dev/null; then ok "clock $(date '+%F %T %Z') (source: ${src:-?})"
else fail "clock looks wrong: $(date '+%F %T %Z') (source: ${src:-?})"; fi

echo "== bind mounts over the rootfs (all, not only ours)"
awk '$2 ~ /^\/(usr|etc|lib|bin|sbin)\// && $2 !~ /^\/usr\/(share\/fonts|lib\/nyx\/modules)$/ { print "INFO   " $1 " on " $2 }' /proc/mounts

echo "== sockets"
# /proc/net/{tcp,udp}{,6}: established/connected peers and listeners.
sockets=$(for f in tcp udp tcp6 udp6; do
    [ -f /proc/net/$f ] || continue
    awk -v proto=$f -v allow="$LISTEN_ALLOW" -v allowremote="$ALLOW_REMOTE" '
    function h2d(h,   i, c, v) { v = 0; h = toupper(h); for (i = 1; i <= length(h); i++) { c = index("0123456789ABCDEF", substr(h, i, 1)) - 1; v = v * 16 + c }; return v }
    function v4(h,   a) { return h2d(substr(h,7,2)) "." h2d(substr(h,5,2)) "." h2d(substr(h,3,2)) "." h2d(substr(h,1,2)) }
    function addr(h) {
        if (length(h) == 8) return v4(h)
        if (substr(h,1,24) == "0000000000000000FFFF0000") return v4(substr(h,25,8))
        if (h == "00000000000000000000000000000000") return "::"
        if (h == "00000000000000000000000001000000") return "::1"
        return "v6:" h
    }
    function lan(a) {
        return a ~ /^(10\.|127\.|192\.168\.|169\.254\.|0\.0\.0\.0$|::$|::1$)/ || a ~ /^172\.(1[6-9]|2[0-9]|3[01])\./ || a ~ /^v6:FE80/ || a ~ /^(22[4-9]|23[0-9])\./ || a == "255.255.255.255"
    }
    BEGIN { n = split(allow, al, " "); for (i = 1; i <= n; i++) ok[al[i]] = 1
            m = split(allowremote, ar, " "); for (i = 1; i <= m; i++) okr[ar[i]] = 1 }
    NR > 1 {
        split($2, l, ":"); split($3, r, ":"); st = $4
        la = addr(l[1]); lp = h2d(l[2]); ra = addr(r[1]); rp = h2d(r[2]); p = substr(proto, 1, 3)
        if (st == "0A" || (p == "udp" && ra ~ /^(0\.0\.0\.0|::)$/)) {
            key = p ":" lp
            if (la ~ /^127\./ || la == "::1") next
            if (key in ok) print "OK   listen " key " (" la ")"
            else print "FAIL listen " key " on " la " not in allow-list  inode=" $10
        } else if (st == "01") {
            if (lan(ra)) print "OK   " p " " la ":" lp " <-> " ra ":" rp " (LAN)"
            else if ((ra in okr)) print "WARN " p " " la ":" lp " <-> " ra ":" rp " (allowed by ALLOW_REMOTE)"
            else print "FAIL " p " " la ":" lp " <-> " ra ":" rp " NOT LAN  inode=" $10
        }
    }' /proc/net/$f
done 2>/dev/null)
echo "$sockets" | sort -u | while read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
        *inode=*)
            ino=${line##*inode=}
            who=""
            for p in /proc/[0-9]*; do
                ls -l $p/fd 2>/dev/null | grep -q "socket:\[$ino\]" && { who="$(cat $p/comm 2>/dev/null)[${p#/proc/}]"; break; }
            done
            pname=${who%%\[*}
            if [ "${line#FAIL listen}" != "$line" ] && in_words "proc:$pname" $LISTEN_ALLOW; then
                echo "OK  ${line#FAIL}" | sed 's/ not in allow-list.*//' | sed "s/\$/ by $who (process allowed)/"
            elif [ "${line#FAIL listen udp}" != "$line" ] && [ "$(echo "$line" | sed -n 's/.*udp:\([0-9]*\).*/\1/p')" -ge 32768 ] 2>/dev/null; then
                echo "WARN${line#FAIL}" | sed "s/ not in allow-list.*/ (unconnected ephemeral UDP) by $who/"
            else
                echo "${line% *inode=*} by ${who:-?}"
            fi ;;
        *) echo "$line" ;;
    esac
done
