#!/bin/sh
# Install or remove the theme-pack boot hook and the Settings stub it mounts over LG's Settings app.
#   TV_HOST=<address> install-boot.sh install
#   TV_HOST=<address> install-boot.sh remove
# Running install again repairs a missing or outdated hook or stub. Needs root SSH (Homebrew Channel) and node.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
here=$(cd "$(dirname "$0")" && pwd)
root=/media/developer/themepack
hook=/var/lib/webosbrew/init.d/60-themepack

case "${1:-}" in
  install)
    sh -n "$here/60-themepack" || { echo "60-themepack has a syntax error; not installing" >&2; exit 1; }
    stub=$(mktemp -d)
    trap 'rm -rf "$stub"' EXIT
    node "$here/settings-stub.mjs" "$stub" >/dev/null
    ssh "root@$host" sh -s < "$here/settings-unmount.sh"
    # $root/settings held the patched Settings app this stub replaces.
    ssh "root@$host" "rm -rf $root/settings $root/settings-stub.new && mkdir -p $root/settings-stub.new"
    tar -C "$stub" -cf - . | ssh "root@$host" "tar -C $root/settings-stub.new -mxf - && rm -rf $root/settings-stub && mv $root/settings-stub.new $root/settings-stub"
    scp -q "$here/60-themepack" "root@$host:$hook"
    ssh "root@$host" "chmod 755 $hook && $hook; tail -8 /tmp/themepack.log"
    ;;
  remove)
    ssh "root@$host" "rm -f $hook"
    ssh "root@$host" sh -s < "$here/settings-unmount.sh"
    ssh "root@$host" "rm -rf $root/settings $root/settings-stub; echo removed"
    ;;
  *)
    echo "usage: TV_HOST=... install-boot.sh install | remove" >&2
    exit 2
    ;;
esac
