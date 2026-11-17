#!/bin/sh
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
user=${TV_ROOT_USER:-root}

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
