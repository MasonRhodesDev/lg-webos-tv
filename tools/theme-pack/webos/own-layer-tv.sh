#!/bin/sh
# Put our UI layer on the TV and start the compositor with it, or go back to stock.
#   TV_HOST=<address> own-layer-tv.sh apply     copy ui/ and own-layer.sh, then restart the compositor with the layer
#   TV_HOST=<address> own-layer-tv.sh revert    restart the compositor on stock
# The work runs on the TV, so a dropped SSH session cannot stop halfway.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
dest=/media/developer/themepack/layer

case "${1:-}" in
  apply)
    ssh "root@$host" "rm -rf $dest.new && mkdir -p $dest.new"
    tar -C "$here/.." -cf - ui | ssh "root@$host" "tar -C $dest.new -mxf -"
    scp -q "$here/own-layer.sh" "root@$host:$dest.new/own-layer.sh"
    ssh "root@$host" "rm -rf $dest && mv $dest.new $dest && (sh $dest/own-layer.sh apply </dev/null >/dev/null 2>&1 &)"
    ;;
  revert)
    ssh "root@$host" "(sh $dest/own-layer.sh revert </dev/null >/dev/null 2>&1 &)"
    ;;
  *) echo "usage: TV_HOST=... own-layer-tv.sh apply | revert" >&2; exit 2 ;;
esac
echo "started on the TV; follow with: ssh root@\$TV_HOST tail -f /tmp/own-layer.log"
