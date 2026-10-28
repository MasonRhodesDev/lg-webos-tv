#!/bin/sh
# Install or remove the theme-pack boot hook and the patched Settings it mounts.
#   TV_HOST=<address> install-boot.sh install PATCHED_SETTINGS_DIR
#   TV_HOST=<address> install-boot.sh remove
# Running install again repairs a missing or outdated hook. Needs root SSH (Homebrew Channel).
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
app=/usr/palm/applications/com.palm.app.settings
root=/media/developer/themepack
hook=/var/lib/webosbrew/init.d/60-themepack

case "${1:-}" in
  install)
    src=${2:?usage: install-boot.sh install PATCHED_SETTINGS_DIR}
    sh -n "$here/60-themepack" || { echo "60-themepack has a syntax error; not installing" >&2; exit 1; }
    ssh "root@$host" sh -s < "$here/settings-unmount.sh"
    stock=$(ssh "root@$host" "md5sum $app/main.js" | cut -c1-32)
    built=$(cut -c1-32 "$src/.stock-main.md5")
    if [ "$stock" != "$built" ]; then
      echo "the patch was built from a different Settings (TV $stock, patch $built); rebuild it from this TV's copy" >&2
      exit 1
    fi
    ssh "root@$host" "rm -rf $root/settings.new && mkdir -p $root/settings.new"
    tar -C "$src" -cf - . | ssh "root@$host" "tar -C $root/settings.new -mxf - && rm -rf $root/settings && mv $root/settings.new $root/settings"
    scp -q "$here/60-themepack" "root@$host:$hook"
    ssh "root@$host" "chmod 755 $hook && rm -rf /tmp/themepack && $hook; tail -8 /tmp/themepack.log"
    ;;
  remove)
    ssh "root@$host" "rm -f $hook"
    ssh "root@$host" sh -s < "$here/settings-unmount.sh"
    ssh "root@$host" "rm -rf $root/settings; echo removed"
    ;;
  *)
    echo "usage: TV_HOST=... install-boot.sh install PATCHED_SETTINGS_DIR | remove" >&2
    exit 2
    ;;
esac
