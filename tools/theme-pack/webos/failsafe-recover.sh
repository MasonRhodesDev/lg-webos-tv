#!/bin/sh
DIR=/var/lib/webosbrew
LOG=$DIR/failsafe-recover.log
COUNT=$DIR/failsafe-recover.count
ID=$DIR/failsafe-recover.activity
AM=luna://com.webos.service.activitymanager
STARTUP=/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh

arm() {
  id=$(cat $ID 2>/dev/null)
  [ -n "$id" ] && luna-send -n 1 -w 5000 $AM/getDetails "{\"activityId\":$id,\"current\":true,\"internal\":false}" </dev/null |
    grep -q '"name":"themepack.failsafe-recover"' && return
  at=$(date -d @$(( $(date +%s) + 300 )) '+%Y-%m-%d %H:%M:%S')
  luna-send -n 1 -w 5000 $AM/create '{"activity":{"name":"themepack.failsafe-recover","description":"Brings the TV out of Homebrew failsafe (theme-pack failsafe-recover.sh)","type":{"background":true,"persist":true},"schedule":{"start":"'"$at"'","local":true},"callback":{"method":"luna://org.webosbrew.hbchannel.service/exec","params":{"command":"/var/lib/webosbrew/failsafe-recover.sh"}}},"start":true}' </dev/null |
    grep -o '"activityId":[0-9]*' | cut -d: -f2 > $ID
}
[ "${1:-}" = --arm ] && { arm; exit 0; }
( sleep 10; arm ) </dev/null >/dev/null 2>&1 &

[ "$(cut -d. -f1 /proc/uptime)" -ge 150 ] || exit 0
[ -e /tmp/webosbrew_startup ] || exit 0
[ -e /tmp/webosbrew-hooks-ran ] && exit 0
[ -e /var/luna/preferences/webosbrew_sshd_enabled ] && pgrep -f "org.webosbrew.hbchannel.service/bin/dropbear" >/dev/null && exit 0
[ -e /tmp/themepack-recovering ] && exit 0

[ -f $LOG ] && [ $(wc -c < $LOG) -gt 50000 ] && mv $LOG $LOG.old
n=$(cat $COUNT 2>/dev/null || echo 0)
if [ "$n" -ge 2 ]; then
  [ -e /tmp/themepack-recover-gave-up ] || echo "$(date -u +%FT%TZ) failsafe again after $n recoveries in a row; leaving it" >> $LOG
  touch /tmp/themepack-recover-gave-up
  exit 0
fi
echo $((n + 1)) > $COUNT
touch /tmp/themepack-recovering
echo "$(date -u +%FT%TZ) up $(cut -d' ' -f1 /proc/uptime): failsafe boot, running Homebrew's startup again (recovery $((n + 1)) in a row)" >> $LOG
[ -e /var/luna/preferences/webosbrew_telnet_disabled ] && pkill -f "org.webosbrew.hbchannel.service/bin/telnetd"
rm -f /tmp/webosbrew_startup
( /bin/bash $STARTUP; echo "$(date -u +%FT%TZ) startup finished ($?)" >> $LOG ) </dev/null >/dev/null 2>&1 &
