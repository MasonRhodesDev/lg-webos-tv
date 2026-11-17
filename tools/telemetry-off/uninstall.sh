#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "$0")/common.sh"

keep=0
[ "${1:-}" = --keep-files ] && keep=1

tv "if [ -f $TV_HOOK ]; then sh $TV_HOOK revert; tail -n 30 /var/log/telemetry-off.log; else echo 'hook not installed'; fi"
if [ "$keep" = 0 ]; then
  tv "rm -f $TV_HOOK && rm -rf $TV_DIR && echo 'removed hook and kit dir; log kept: /var/log/telemetry-off.log'"
fi
