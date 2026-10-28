#!/bin/sh
# Load the compositor's Look (ThemePack + bound styles) on the TV, with a watchdog that falls back to stock.
#   TV_HOST=<address> compositor-look-tv.sh apply BUILT_DIR    copy, verify, mount, restart the compositor
#   TV_HOST=<address> compositor-look-tv.sh revert             unmount and restart the compositor on stock
# The restart briefly blanks the on-screen UI. The work runs on the TV, so a dropped SSH session cannot stop halfway.
set -eu
host=${TV_HOST:?set TV_HOST to the TV address}
root=/media/developer/themepack/qml
q=/usr/lib/qt5/qml

remote() {
  cat <<SCRIPT
q=$q; root=$root; log=/tmp/compositor-look.log
exec >>\$log 2>&1; echo "=== \$(date) \$1"
fg=\$(luna-send -n 1 -w 5000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p')
unmount() { while mount | grep -q " \$q/SystemUIAssets "; do umount \$q/SystemUIAssets; done; while mount | grep -q " \$q/InputPicker/Style.qml "; do umount \$q/InputPicker/Style.qml; done; }
healthy() {
  i=0; while [ \$i -lt 40 ]; do
    sleep 1; i=\$((i + 1))
    pidof surface-manager-starfish >/dev/null || continue
    # Healthy when the compositor can render a frame: the capture file appears. Output formatting is not relied on.
    rm -f /tmp/.cl.png
    luna-send -n 1 -w 3000 luna://com.webos.surfacemanager/captureCompositorOutput '{"output":"/tmp/.cl.png","format":"PNG"}' >/dev/null 2>&1
    [ -s /tmp/.cl.png ] && { rm -f /tmp/.cl.png; return 0; }
  done; return 1
}
restart() { initctl restart surface-manager >/dev/null 2>&1 || initctl start surface-manager >/dev/null 2>&1; }
reopen() { [ -n "\$fg" ] && sleep 3 && luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch "{\"id\":\"\$fg\"}" >/dev/null && echo "reopened \$fg"; }
if [ "\$1" = apply ]; then
  unmount
  ok=1; while read sum file; do [ "\$(md5sum \$q/\$file | cut -c1-32)" = "\$sum" ] || { echo "stock \$file differs; not applying"; ok=0; }; done < \$root/.stock.md5
  [ \$ok = 1 ] || exit 1
  mount --bind \$root/SystemUIAssets \$q/SystemUIAssets && mount --bind \$root/InputPicker/Style.qml \$q/InputPicker/Style.qml && echo mounted
  restart
  if healthy; then echo "compositor healthy with Look"; else echo "compositor unhealthy; reverting"; unmount; restart; healthy && echo "compositor healthy on stock"; fi
  grep -E "ThemePack|Unable to load a style module|StyleYSM" /var/log/messages | tail -5
else
  unmount; restart; healthy && echo "compositor healthy on stock"
fi
reopen
echo done
SCRIPT
}

case "${1:-}" in
  apply)
    src=${2:?usage: compositor-look-tv.sh apply BUILT_DIR}
    ssh "root@$host" "mkdir -p $root.new && rm -rf $root.new/*"
    tar -C "$src" -cf - . | ssh "root@$host" "tar -C $root.new -mxf - && rm -rf $root && mv $root.new $root"
    remote apply | ssh "root@$host" "cat > /tmp/compositor-look.sh && (sh /tmp/compositor-look.sh apply </dev/null >/dev/null 2>&1 &)"
    ;;
  revert)
    remote revert | ssh "root@$host" "cat > /tmp/compositor-look.sh && (sh /tmp/compositor-look.sh revert </dev/null >/dev/null 2>&1 &)"
    ;;
  *) echo "usage: TV_HOST=... compositor-look-tv.sh apply BUILT_DIR | revert" >&2; exit 2 ;;
esac
echo "started on the TV; follow with: ssh root@\$TV_HOST tail -f /tmp/compositor-look.log"
