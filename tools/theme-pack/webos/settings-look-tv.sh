#!/bin/sh
# Try the patched Settings app on the TV without changing anything persistent.
#   TV_HOST=<address> settings-look-tv.sh apply PATCHED_APP_DIR   copy to RAM, mount over the stock app, relaunch
#   TV_HOST=<address> settings-look-tv.sh revert                  unmount and relaunch the stock app
# The copy lives in /tmp and the mount is not recreated at boot, so a reboot also reverts.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
app=/usr/palm/applications/com.palm.app.settings
stage=/tmp/themepack/com.palm.app.settings
relaunch='luna-send -n 1 luna://com.webos.applicationManager/closeByAppId "{\"id\":\"com.palm.app.settings\"}" >/dev/null; sleep 1;
luna-send -n 1 luna://com.palm.webappmanager/discardCodeCache "{\"force\":true}" >/dev/null;
luna-send -n 1 luna://com.webos.applicationManager/launch "{\"id\":\"com.palm.app.settings\"}"'

case "${1:-}" in
  apply)
    src=${2:?usage: settings-look-tv.sh apply PATCHED_APP_DIR}
    ssh "root@$host" "mkdir -p $stage && rm -rf $stage/*"
    tar -C "$src" -cf - . | ssh "root@$host" "tar -C $stage -xf -"
    ssh -tt "root@$host" "mount | grep -q ' $app ' || mount --bind $stage $app; $relaunch"
    ;;
  revert)
    ssh "root@$host" sh -s < "$here/settings-unmount.sh"
    ssh -tt "root@$host" "rm -rf $stage; $relaunch"
    ;;
  *)
    echo "usage: TV_HOST=... settings-look-tv.sh apply PATCHED_APP_DIR | revert" >&2
    exit 2
    ;;
esac
