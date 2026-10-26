#!/usr/bin/env bash
# Read-only check of the TV against the telemetry-off kit.
#
# Usage: tools/telemetry-off/verify.sh [-q]
#   -q   print only WARN/FAIL lines
#
# Reports: target processes and upstart jobs still running, stub mounts,
# the hosts blackhole (and stale jail copies), settings and user-agreement
# values, every bind mount over the rootfs, and every connected or listening
# socket that is not LAN/loopback or not in listen-allow.txt.
# Exit 0 = all OK, 1 = at least one FAIL, 2 = could not reach the TV.
#
# ALLOW_REMOTE="a.b.c.d ..." (env) downgrades connections to those
# addresses from FAIL to WARN.
#
# Nothing is written on the TV: the probe is streamed to `sh -s` and
# luna-send runs under script(1) with /dev/null as its typescript.
set -euo pipefail
. "$(dirname "$0")/common.sh"
quiet=0; [ "${1:-}" = -q ] && quiet=1

data() { grep -v '^[[:space:]]*#' "$1" | grep -v '^[[:space:]]*$'; }
shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

conf_eula_keys=$(sed -n 's/^EULA_KEYS="\(.*\)"/\1/p' "$KIT_DIR/telemetry-off.conf.example")
probe=$(
  echo "TARGETS=$(shq "$(data "$KIT_DIR/targets.tsv" | awk '{print $1, $3, $4}')")"
  echo "LISTEN_ALLOW=$(shq "$(data "$KIT_DIR/listen-allow.txt" | awk '{printf "%s ", $1}')")"
  echo "SETTINGS=$(shq "$(data "$KIT_DIR/settings.tsv")")"
  echo "SENTINELS='us.lgtvsdp.com acrdb.alphonso.tv us.ad.lgsmartad.com aic.nudge.lgtvcommon.com us.rdx2.lgtvsdp.com snu.lge.com'"
  echo "EULA_KEYS=$(shq "$conf_eula_keys")"
  echo "ALLOW_REMOTE=$(shq "${ALLOW_REMOTE:-}")"
  cat "$KIT_DIR/verify-remote.sh"
)
out=$(printf '%s\n' "$probe" | tv 'sh -s') || { echo "could not run the probe on $TV_HOST" >&2; exit 2; }
if [ "$quiet" = 1 ]; then
  printf '%s\n' "$out" | grep -E '^(WARN|FAIL|==)' || true
else
  printf '%s\n' "$out"
fi
nfail=$(printf '%s\n' "$out" | grep -c '^FAIL' || true)
nwarn=$(printf '%s\n' "$out" | grep -c '^WARN' || true)
echo "== summary: $nfail FAIL, $nwarn WARN"
[ "$nfail" -eq 0 ]
