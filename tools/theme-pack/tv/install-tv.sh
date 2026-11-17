#!/bin/sh
set -eu
ipk=${1:?usage: TV_HOST=... install-tv.sh app.ipk}
host=${TV_HOST:?set TV_HOST to the TV address}
user=${TV_ROOT_USER:-root}
id=$(basename "$ipk" | cut -d_ -f1)
remote=/tmp/$(basename "$ipk")

scp -q "$ipk" "$user@$host:$remote"
ssh -tt "$user@$host" "luna-send -w 60000 -i luna://com.webos.appInstallService/dev/install '{\"id\":\"$id\",\"ipkUrl\":\"$remote\",\"subscribe\":true}' | grep -m1 -E '\"(installed|failed)\"|errorText'; rm -f $remote"
ssh "$user@$host" "s=/media/developer/apps/usr/palm/services/$id.service/permissions.sh; if [ -f \$s ]; then
  sh \$s && { timeout -t 120 ls-control scan-services >/dev/null 2>&1 || echo 'ls-control scan-services did not finish'; }
fi"
echo "launch with: ssh -tt $user@$host \"luna-send -n 1 luna://com.webos.applicationManager/launch '{\\\"id\\\":\\\"$id\\\"}'\""
