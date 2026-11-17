#!/bin/sh
export PATH=/usr/sbin:/usr/bin:/sbin:/bin:$PATH
app=/usr/palm/applications/com.palm.app.settings
luna-send -n 1 -w 5000 luna://com.webos.applicationManager/closeByAppId '{"id":"com.palm.app.settings"}' </dev/null >/dev/null 2>&1
i=0
while mount | grep -q " $app "; do
  umount $app 2>/dev/null && continue
  i=$((i + 1))
  [ $i -ge 10 ] && { echo "Settings is still in use; left mounted" >&2; exit 1; }
  sleep 1
done
