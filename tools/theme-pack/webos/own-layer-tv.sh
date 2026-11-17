#!/bin/sh
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
dest=/media/developer/themepack/layer
lock=/tmp/own-layer.lock

on_tv() { ssh -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=2 "root@$host" "$@"; }
locked() {
  i=0
  until on_tv "mkdir $lock 2>/dev/null || { [ \$(( \$(date +%s) - \$(stat -c %Y $lock) )) -gt 600 ] && rm -rf $lock && mkdir $lock; }"; do
    [ $i = 0 ] && echo "waiting for the TV lock (another copy is testing)" >&2
    i=$((i + 1)); [ $i -gt 180 ] && { echo "TV lock still held after 15 min" >&2; exit 1; }
    sleep 5
  done
}
run_and_wait() {
  on_tv "(sh $dest/own-layer.sh $1; rmdir $lock) </dev/null >/dev/null 2>&1 &"
  i=0
  until on_tv "[ ! -d $lock ]"; do
    i=$((i + 1)); [ $i -gt 200 ] && { echo "the TV-side $1 did not finish within 10 min (lock $lock still held)" >&2; exit 1; }
    sleep 3
  done
  on_tv "sed -n '/^=== /h; /^=== /!H; \${x;p}' /tmp/own-layer.log"
}

case "${1:-}" in
  apply|restart)
    locked
    on_tv "rm -rf $dest.new && mkdir -p $dest.new"
    tar -C "$here/.." -cf - ui | on_tv "tar -C $dest.new -mxf -"
    scp -q "$here/own-layer.sh" "root@$host:$dest.new/own-layer.sh"
    on_tv "rm -rf $dest && mv $dest.new $dest"
    run_and_wait "$1"
    ;;
  revert)
    locked
    run_and_wait revert
    ;;
  reports)
    ssh -tt "root@$host" "luna-send -n 1 -w 5000 luna://dev.themepack.look.service/getReports '{}'" 2>/dev/null
    ;;
  capture)
    out=${2:?usage: own-layer-tv.sh capture OUT.png}
    ssh -tt "root@$host" "rm -f /tmp/.own-layer.png; luna-send -n 1 -w 5000 luna://com.webos.surfacemanager/captureCompositorOutput '{\"output\":\"/tmp/.own-layer.png\",\"format\":\"PNG\"}' >/dev/null" 2>/dev/null
    scp -q "root@$host:/tmp/.own-layer.png" "$out"
    ;;
  *) echo "usage: TV_HOST=... own-layer-tv.sh apply | restart | revert | reports | capture OUT.png" >&2; exit 2 ;;
esac
