#!/bin/sh
# Brings the TV out of Homebrew's failsafe without a reboot. Failsafe skips Homebrew's boot hooks but not LG's
# activity manager, which runs this as root through Homebrew's exec. The activity manager deletes an activity once it
# has run, so each run schedules the next, 5 minutes on (`--arm`, also run by 99-clear-failsafe at each normal boot).
# A run that came due while the TV was off runs as soon as the TV is up again.
# A failsafe boot is one where Homebrew's startup ran (/tmp/webosbrew_startup) but no boot hook did (05-clean-poweroff
# leaves /tmp/webosbrew-hooks-ran). Homebrew has already cleared its flag by then, so running its startup again takes
# the normal path: SSH, the update block, then every boot hook, as at a normal power-on.
# At most twice in a row: a startup that really crashes the TV would bring it back here each time, and then failsafe
# should stay. A boot whose hooks ran by themselves resets the count (99-clear-failsafe).
DIR=/var/lib/webosbrew
LOG=$DIR/failsafe-recover.log
COUNT=$DIR/failsafe-recover.count
ID=$DIR/failsafe-recover.activity
AM=luna://com.webos.service.activitymanager
STARTUP=/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/startup.sh

# The next run, unless one is already scheduled.
arm() {
  id=$(cat $ID 2>/dev/null)
  [ -n "$id" ] && luna-send -n 1 -w 5000 $AM/getDetails "{\"activityId\":$id,\"current\":true,\"internal\":false}" </dev/null |
    grep -q '"name":"themepack.failsafe-recover"' && return
  at=$(date -d @$(( $(date +%s) + 300 )) '+%Y-%m-%d %H:%M:%S')
  luna-send -n 1 -w 5000 $AM/create '{"activity":{"name":"themepack.failsafe-recover","description":"Brings the TV out of Homebrew failsafe (theme-pack failsafe-recover.sh)","type":{"background":true,"persist":true},"schedule":{"start":"'"$at"'","local":true},"callback":{"method":"luna://org.webosbrew.hbchannel.service/exec","params":{"command":"/var/lib/webosbrew/failsafe-recover.sh"}}},"start":true}' </dev/null |
    grep -o '"activityId":[0-9]*' | cut -d: -f2 > $ID
}
[ "${1:-}" = --arm ] && { arm; exit 0; }
# Run by the activity: it is deleted only once this returns, so the next is scheduled a moment later.
( sleep 10; arm ) </dev/null >/dev/null 2>&1 &

# Homebrew's startup has had time to finish; until then the next run looks.
[ "$(cut -d. -f1 /proc/uptime)" -ge 150 ] || exit 0
[ -e /tmp/webosbrew_startup ] || exit 0
[ -e /tmp/webosbrew-hooks-ran ] && exit 0
# Homebrew starts SSH on a normal boot when it is enabled; running, it is not a failsafe boot.
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
# Failsafe opened a telnet shell; a normal boot opens one only if telnet is enabled.
[ -e /var/luna/preferences/webosbrew_telnet_disabled ] && pkill -f "org.webosbrew.hbchannel.service/bin/telnetd"
rm -f /tmp/webosbrew_startup
( /bin/bash $STARTUP; echo "$(date -u +%FT%TZ) startup finished ($?)" >> $LOG ) </dev/null >/dev/null 2>&1 &
