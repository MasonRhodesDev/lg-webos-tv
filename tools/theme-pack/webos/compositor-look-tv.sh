#!/bin/sh
# Load the compositor's Look (ThemePack + bound styles) on the TV, with a watchdog that falls back to stock.
#   TV_HOST=<address> compositor-look-tv.sh apply BUILT_DIR    copy, verify, mount, restart the compositor
#   TV_HOST=<address> compositor-look-tv.sh revert             unmount and restart the compositor on stock
# The build and compositor-look.sh stay on the TV, where the boot hook applies them again after every boot.
# The work runs on the TV, so a dropped SSH session cannot stop halfway.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
root=/media/developer/themepack/qml

case "${1:-}" in
  apply)
    src=${2:?usage: compositor-look-tv.sh apply BUILT_DIR}
    ssh "root@$host" "mkdir -p $root.new && rm -rf $root.new/*"
    tar -C "$src" -cf - . | ssh "root@$host" "tar -C $root.new -mxf -"
    scp -q "$here/compositor-look.sh" "root@$host:$root.new/compositor-look.sh"
    ssh "root@$host" "rm -rf $root && mv $root.new $root && (sh $root/compositor-look.sh apply </dev/null >/dev/null 2>&1 &)"
    ;;
  revert)
    ssh "root@$host" "(sh $root/compositor-look.sh revert </dev/null >/dev/null 2>&1 &)"
    ;;
  *) echo "usage: TV_HOST=... compositor-look-tv.sh apply BUILT_DIR | revert" >&2; exit 2 ;;
esac
echo "started on the TV; follow with: ssh root@\$TV_HOST tail -f /tmp/compositor-look.log"
