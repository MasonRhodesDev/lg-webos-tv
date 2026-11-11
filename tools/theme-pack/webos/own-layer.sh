#!/bin/sh
# Runs on the TV. Puts our UI layer (ui/ next to this script) into the compositor.
#   own-layer.sh apply          load the layer into the running compositor, in place of one already loaded
#   own-layer.sh restart        restart the compositor with the layer first on its QML import path; back on stock (and
#                               exit 1) if the layer never reports
#   own-layer.sh revert         restart the compositor on stock, which is the only way to unload the layer
# apply restarts nothing and the screen never blanks: LG's system UI manager loads ui/Inject.qml as an overlay that
# draws nothing, and that file creates the layer under LG's root. A new layer that does not load leaves the loaded
# one running (exit 1). No LG file is edited or mounted over either way. restart and revert blank the screen for
# about 15 s.
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH
root=$(cd "$(dirname "$0")" && pwd)
q=/usr/lib/qt5/qml
svc=luna://dev.themepack.look.service
# luna-send reads stdin when it is open, which stalls it when this runs over ssh; detach it.
exec </dev/null >>/tmp/own-layer.log 2>&1
echo "=== $(date) $1"
# /tmp is gone after a cold boot, so the outcome also goes to a log that stays, with the uptime (the clock can be
# years out until it is set).
PLOG=/var/lib/webosbrew/themepack-boot.log
note() {
  echo "$*"
  [ -f $PLOG ] && [ $(wc -c < $PLOG) -gt 32768 ] && mv -f $PLOG $PLOG.old
  echo "up $(cut -d' ' -f1 /proc/uptime) own-layer $*" >> $PLOG
}

compositor() {
  fg=$(luna-send -n 1 -w 5000 luna://com.webos.applicationManager/getForegroundAppInfo '{}' | sed -n 's/.*"appId":"\([^"]*\)".*/\1/p')
  initctl stop surface-manager >/dev/null 2>&1
  # The earlier patch approach mounted edited LG files here; the layer runs on unmodified LG QML.
  while mount | grep -q " $q/SystemUIAssets "; do umount $q/SystemUIAssets || break; done
  while mount | grep -q " $q/InputPicker/Style.qml "; do umount $q/InputPicker/Style.qml || break; done
  initctl start surface-manager "$@" >/dev/null 2>&1
}
reopen() { [ -n "$fg" ] && sleep 3 && luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch "{\"id\":\"$fg\"}" >/dev/null && echo "reopened $fg"; }
# The layer reports to the Look service as it loads, so any report from it that is not an error counts. Report times
# are UTC ISO strings, so they compare as text.
reported_since() {
  last=$(luna-send -n 1 -w 5000 $svc/getReports '{}' | grep -o '"at":"[^"]*","from":"ui","kind":"\(root\|ok\|ready\)"' | tail -1 | cut -d'"' -f4)
  [ -n "$last" ] && [ "$last" \> "$1" ]
}
# What the injector said went wrong, if it said so since $1. A layer that does not compile is reported like this.
inject_error() {
  e=$(luna-send -n 1 -w 5000 $svc/getReports '{}' | grep -o '"at":"[^"]*","from":"ui","kind":"error","text":"inject: [^"]*' | tail -1)
  [ -n "$e" ] && [ "$(echo "$e" | cut -d'"' -f4)" \> "$1" ] && echo "$e" | sed 's/.*"text":"inject: //'
}
# Counted in rounds, not by the clock: the TV can suspend in the middle and resume hours later, and the clock can be
# set in the middle. Either would end a clock deadline at once, before the layer has had its time. Ends early, with
# the reason in $why, once the injector has reported an error.
wait_for_report() {
  i=0; why=
  while [ $i -lt "$2" ]; do
    sleep 1; i=$((i + 1))
    reported_since "$1" && return 0
    why=$(inject_error "$1"); [ -n "$why" ] && return 1
  done
  return 1
}
# LG's system UI manager loads the QML file $1 as an overlay. The app id is new each time: a second launch of an id
# that is still registered would reach the loaded file instead of loading it again.
launch() {
  luna-send -n 1 -w 10000 luna://com.webos.service.systemUIManager/launch "{\"appId\":\"dev.themepack.inject.$$.$2\",\"main\":\"file://$1\",\"defaultWindowType\":\"overlay\",\"windowType\":\"_WEBOS_SYSTEM_UI_TYPE_OVERLAY\"}" | grep -q '"returnValue": *true'
}

rc=0
t0=$(date -u +%Y-%m-%dT%H:%M:%S)
case "$1" in
  apply)
    # The compositor keeps every QML file it has loaded, by path, so each load is from a copy at a path it has not
    # seen in this boot.
    copy=/tmp/themepack-layer.$$.$(cut -d. -f1 /proc/uptime)
    rm -rf $copy && cp -r "$root/ui" $copy
    main=$copy/Inject.qml
    # Early in a boot the compositor may not be answering yet.
    n=0; sent=0
    while [ $n -lt 5 ]; do n=$((n + 1)); launch "$main" $n && { sent=1; break; }; sleep 3; done
    if [ $sent = 1 ] && wait_for_report "$t0" 30; then
      note "layer loaded after $i rounds (no restart)"
      # Copies from earlier runs; their layers are gone.
      for d in /tmp/themepack-layer.*; do [ "$d" = "$copy" ] || rm -rf "$d"; done
    else
      # A layer loaded earlier is still running, from its own copy.
      if [ $sent != 1 ]; then why="the system UI manager did not take the launch"
      else why=${why:-no report from the new layer}; fi
      note "$why; the screen is left as it was"; rm -rf $copy; rc=1
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
