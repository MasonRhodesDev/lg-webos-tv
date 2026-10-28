#!/bin/sh
# Runs on the TV. Starts the compositor with our UI layer (ui/ next to this script) first on its QML import path,
# so our YSM module wraps LG's and no LG file is edited or mounted over.
#   own-layer.sh apply    restart the compositor with the layer; back on stock (and exit 1) if the layer's root never reports
#   own-layer.sh revert   restart the compositor on stock
# The restart briefly blanks the on-screen UI.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH
root=$(cd "$(dirname "$0")" && pwd)
q=/usr/lib/qt5/qml
svc=luna://dev.themepack.look.service
# luna-send reads stdin when it is open, which stalls it when this runs over ssh; detach it.
exec </dev/null >>/tmp/own-layer.log 2>&1
echo "=== $(date) $1"

fg=$(luna-send -n 1 -w 5000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p')
compositor() {
  initctl stop surface-manager >/dev/null 2>&1
  # The earlier patch approach mounted edited LG files here; the layer runs on unmodified LG QML.
  while mount | grep -q " $q/SystemUIAssets "; do umount $q/SystemUIAssets || break; done
  while mount | grep -q " $q/InputPicker/Style.qml "; do umount $q/InputPicker/Style.qml || break; done
  initctl start surface-manager "$@" >/dev/null 2>&1
}
# The layer's root reports to the Look service as soon as it loads. Report times are UTC ISO strings, so they
# compare as text.
reported_since() {
  last=$(luna-send -n 1 -w 5000 $svc/getReports '{}' | grep -o '"at":"[^"]*","from":"ui","kind":"root"' | tail -1 | cut -d'"' -f4)
  [ -n "$last" ] && [ "$last" \> "$1" ]
}
reopen() { [ -n "$fg" ] && sleep 3 && luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch "{\"id\":\"$fg\"}" >/dev/null && echo "reopened $fg"; }

rc=0
case "$1" in
  apply)
    t0=$(date -u +%Y-%m-%dT%H:%M:%S)
    compositor QML2_IMPORT_PATH=$root/ui:$q
    i=0; ok=0
    while [ $i -lt 60 ]; do sleep 1; i=$((i + 1)); reported_since "$t0" && { ok=1; break; }; done
    if [ $ok = 1 ]; then echo "layer loaded after ${i}s"; else echo "layer root never reported; back to stock"; compositor; rc=1; fi
    ;;
  revert)
    compositor; echo "stock"
    ;;
  *)
    echo "usage: own-layer.sh apply | revert"; exit 2
    ;;
esac
reopen
echo done
exit $rc
