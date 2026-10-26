#!/usr/bin/env bash
# Undo telemetry-off on the TV without a reboot, then remove it.
#
# Usage: tools/telemetry-off/uninstall.sh [--keep-files]
#   --keep-files  revert and disable, but leave the kit installed
#                 (re-arm with: sh /var/lib/webosbrew/init.d/80-telemetry-off enable)
#
# Revert unmounts the stubs and the hosts blackhole, restarts the upstart
# jobs it stopped, restores changed settings and user agreements, and removes
# the LG flag files it created. Wiped buffers cannot be restored.
set -euo pipefail
. "$(dirname "$0")/common.sh"

keep=0
[ "${1:-}" = --keep-files ] && keep=1

tv "if [ -f $TV_HOOK ]; then sh $TV_HOOK revert; tail -n 30 /var/log/telemetry-off.log; else echo 'hook not installed'; fi"
if [ "$keep" = 0 ]; then
  tv "rm -f $TV_HOOK && rm -rf $TV_DIR && echo removed $TV_HOOK $TV_DIR (log kept: /var/log/telemetry-off.log)"
fi
