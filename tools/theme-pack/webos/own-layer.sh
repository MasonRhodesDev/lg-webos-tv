#!/bin/sh
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH
root=$(cd "$(dirname "$0")" && pwd)
q=/usr/lib/qt5/qml
svc=luna://dev.themepack.look.service
exec </dev/null >>/tmp/own-layer.log 2>&1
echo "=== $(date) $1"
PLOG=/var/lib/webosbrew/themepack-boot.log
note() {
  echo "$*"
  [ -f $PLOG ] && [ $(wc -c < $PLOG) -gt 32768 ] && mv -f $PLOG $PLOG.old
  echo "up $(cut -d' ' -f1 /proc/uptime) own-layer $*" >> $PLOG
}

compositor() {
  fg=$(luna-send -n 1 -w 5000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p')
  initctl stop surface-manager >/dev/null 2>&1
  while mount | grep -q " $q/SystemUIAssets "; do umount $q/SystemUIAssets || break; done
  while mount | grep -q " $q/InputPicker/Style.qml "; do umount $q/InputPicker/Style.qml || break; done
  initctl start surface-manager "$@" >/dev/null 2>&1
}
reopen() { [ -n "$fg" ] && sleep 3 && luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch "{\"id\":\"$fg\"}" >/dev/null && echo "reopened $fg"; }
reported_since() {
  last=$(luna-send -n 1 -w 5000 $svc/getReports '{}' | grep -o '"at":"[^"]*","from":"ui","kind":"\(root\|ok\|ready\)"' | tail -1 | cut -d'"' -f4)
  [ -n "$last" ] && [ "$last" \> "$1" ]
}
inject_error() {
  e=$(luna-send -n 1 -w 5000 $svc/getReports '{}' | grep -o '"at":"[^"]*","from":"ui","kind":"error","text":"inject: [^"]*' | tail -1)
  [ -n "$e" ] && [ "$(echo "$e" | cut -d'"' -f4)" \> "$1" ] && echo "$e" | sed 's/.*"text":"inject: //'
}
wait_for_report() {
  i=0; why=
  while [ $i -lt "$2" ]; do
    sleep 1; i=$((i + 1))
    reported_since "$1" && return 0
    why=$(inject_error "$1"); [ -n "$why" ] && return 1
  done
  return 1
}
launch() {
  luna-send -n 1 -w 10000 luna://com.webos.service.systemUIManager/launch "{\"appId\":\"dev.themepack.inject.$$.$2\",\"main\":\"file://$1\",\"defaultWindowType\":\"overlay\",\"windowType\":\"_WEBOS_SYSTEM_UI_TYPE_OVERLAY\"}" | grep -q '"returnValue": *true'
}

rc=0
t0=$(date -u +%Y-%m-%dT%H:%M:%S)
case "$1" in
  apply)
    copy=/tmp/themepack-layer.$$.$(cut -d. -f1 /proc/uptime)
    rm -rf $copy && cp -r "$root/ui" $copy
    main=$copy/Inject.qml
    n=0; sent=0
    while [ $n -lt 5 ]; do n=$((n + 1)); launch "$main" $n && { sent=1; break; }; sleep 3; done
    if [ $sent = 1 ] && wait_for_report "$t0" 30; then
      note "layer loaded after $i rounds (no restart)"
      for d in /tmp/themepack-layer.*; do [ "$d" = "$copy" ] || rm -rf "$d"; done
    elif [ $sent != 1 ] || [ -n "$why" ]; then
      note "${why:-the system UI manager did not take the launch}; the screen is left as it was"; rm -rf $copy; rc=1
    else
      note "no report from the new layer in $i rounds; it may be loaded all the same, so its files stay"; rc=1
    fi
    ;;
  restart)
    note "restarting the compositor with the layer"
    compositor QML2_IMPORT_PATH=$root/ui:$q
    if wait_for_report "$t0" 60; then
      note "layer loaded after $i rounds"
    else
      note "$(date) layer never reported; back to stock"; compositor; rc=1
    fi
    reopen
    ;;
  revert)
    compositor; echo "stock"
    reopen
    ;;
  *)
    echo "usage: own-layer.sh apply | restart | revert"; exit 2
    ;;
esac
echo done
exit $rc
