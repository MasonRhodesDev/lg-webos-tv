#!/usr/bin/env bash
# Install telemetry-off on the TV as a Homebrew Channel init.d hook.
#
# Usage: tools/telemetry-off/install.sh [--dry-run | --apply-now]
#   (none)       copy the kit to the TV; it applies at the next boot
#   --apply-now  also apply immediately (no reboot needed)
#   --dry-run    copy the kit to a scratch dir in the TV's /tmp (tmpfs), run
#                `telemetry-off.sh --dry-run` there, then delete the copy.
#                Nothing outside that scratch dir is written.
#
# Writes on a real install (see docs/telemetry.md, change list):
#   /var/lib/telemetry-off/{telemetry-off.sh,targets.tsv,settings.tsv,
#     wipe.list,telemetry-off.conf.example,domains/}
#   /var/lib/telemetry-off/telemetry-off.conf   (only if absent)
#   /var/lib/webosbrew/init.d/80-telemetry-off  (copy of telemetry-off.sh)
set -euo pipefail
. "$(dirname "$0")/common.sh"

MODE=install
case "${1:-}" in
  "") ;;
  --dry-run) MODE=dry ;;
  --apply-now) MODE=now ;;
  -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unknown option: $1" >&2; exit 2 ;;
esac

# Preflight on the TV: HBC hook dir, tools the script needs.
tv 'test -d /var/lib/webosbrew/init.d || { echo "no HBC init.d dir" >&2; exit 1; }
    for t in mount umount initctl awk sed grep timeout script luna-send tar; do
      command -v $t >/dev/null || { echo "TV lacks $t" >&2; exit 1; }; done
    cat /etc/starfish-release'

if [ "$MODE" = dry ]; then
  scratch=/tmp/telemetry-off-dryrun.$$
  kit_tar | tv "mkdir -p $scratch && tar -xf - -C $scratch"
  # TO_LOG points into the scratch dir too, though --dry-run never logs.
  rc=0
  tv "TO_DIR=$scratch TO_LOG=$scratch/log sh $scratch/telemetry-off.sh --dry-run" || rc=$?
  tv "rm -rf $scratch && ! test -e $scratch" && echo "(scratch copy $scratch removed)"
  exit $rc
fi

kit_tar | tv "mkdir -p $TV_DIR && tar -xf - -C $TV_DIR &&
  chmod 755 $TV_DIR/telemetry-off.sh &&
  { test -f $TV_DIR/telemetry-off.conf || cp $TV_DIR/telemetry-off.conf.example $TV_DIR/telemetry-off.conf; } &&
  cp $TV_DIR/telemetry-off.sh $TV_HOOK.new && chmod 755 $TV_HOOK.new && mv $TV_HOOK.new $TV_HOOK &&
  rm -f $TV_DIR/disabled && ls -l $TV_HOOK"
echo "installed; applies at next boot (HBC run-parts)."
if [ "$MODE" = now ]; then
  tv "sh $TV_HOOK apply; sh $TV_HOOK status"
fi
