#!/bin/sh
# Set a rooted webOS TV's clock to this machine's, over SSH. For a TV with no time source of its own (network time
# blocked, no broadcast): it keeps no time while it is off, so its clock is wrong again after every power-on.
# Usage: TV_HOST=<address> set-clock.sh
# Needs root SSH (Homebrew Channel provides it). The TV's Automatic time should be off, or the TV may set it back.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
user=${TV_ROOT_USER:-root}

# One connection, and the time is read here only once it is open: the TV says "ready", then takes the time on its
# stdin. luna-send stalls on an open stdin, hence /dev/null.
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
mkfifo "$dir/time"
ssh "$user@$host" 'echo ready; read t
  if luna-send -n 1 -w 5000 luna://com.palm.systemservice/time/setSystemTime "{\"utc\":$t}" </dev/null | grep -q "\"returnValue\": *true"
  then echo "set $(date +%s) $(date)"; else echo "refused"; fi' < "$dir/time" | {
  exec 3> "$dir/time"
  read -r ready || ready=
  [ "$ready" = ready ] || { echo "no answer from the TV" >&2; exit 1; }
  date +%s >&3
  exec 3>&-
  read -r word tv rest || word=
  [ "$word" = set ] || { echo "the TV did not take the time" >&2; exit 1; }
  echo "TV clock set: $rest ($((tv - $(date +%s))) s from this machine's)"
}
