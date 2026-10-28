#!/bin/sh
# Runs on the TV. Loads the compositor's Look (ThemePack + bound styles), with a watchdog that falls back to stock.
#   compositor-look.sh apply    verify, mount, restart the compositor
#   compositor-look.sh revert   unmount and restart the compositor on stock
# The build lives next to this script. The restart briefly blanks the on-screen UI.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH
root=$(cd "$(dirname "$0")" && pwd)
q=/usr/lib/qt5/qml
# luna-send reads stdin when it is open, which stalls it when this runs over ssh; detach it.
exec </dev/null >>/tmp/compositor-look.log 2>&1
echo "=== $(date) $1"

fg=$(luna-send -n 1 -w 5000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p')
unmount() {
  while mount | grep -q " $q/SystemUIAssets "; do umount $q/SystemUIAssets; done
  while mount | grep -q " $q/InputPicker/Style.qml "; do umount $q/InputPicker/Style.qml; done
}
healthy() {
  i=0
  while [ $i -lt 40 ]; do
    sleep 1; i=$((i + 1))
    pidof surface-manager-starfish >/dev/null || continue
    # Healthy when the compositor can render a frame: the capture file appears. Output formatting is not relied on.
    rm -f /tmp/.cl.png
    luna-send -n 1 -w 3000 luna://com.webos.surfacemanager/captureCompositorOutput '{"output":"/tmp/.cl.png","format":"PNG"}' >/dev/null 2>&1
    [ -s /tmp/.cl.png ] && { rm -f /tmp/.cl.png; return 0; }
  done
  return 1
}
restart() { initctl restart surface-manager >/dev/null 2>&1 || initctl start surface-manager >/dev/null 2>&1; }
reopen() { [ -n "$fg" ] && sleep 3 && luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch "{\"id\":\"$fg\"}" >/dev/null && echo "reopened $fg"; }

case "$1" in
  apply)
    unmount
    ok=1
    while read sum file; do
      [ "$(md5sum $q/$file | cut -c1-32)" = "$sum" ] || { echo "stock $file differs; not applying"; ok=0; }
    done < $root/.stock.md5
    [ $ok = 1 ] || exit 1
    mount --bind $root/SystemUIAssets $q/SystemUIAssets && mount --bind $root/InputPicker/Style.qml $q/InputPicker/Style.qml && echo mounted
    restart
    if healthy; then echo "compositor healthy with Look"; else echo "compositor unhealthy; reverting"; unmount; restart; healthy && echo "compositor healthy on stock"; fi
    ;;
  revert)
    unmount; restart; healthy && echo "compositor healthy on stock"
    ;;
  *)
    echo "usage: compositor-look.sh apply | revert"; exit 2
    ;;
esac
reopen
echo done
