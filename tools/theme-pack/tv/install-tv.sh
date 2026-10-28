#!/bin/sh
# Copy an .ipk to a rooted webOS TV over SSH and install it with the TV's own installer.
# Usage: TV_HOST=<address> install-tv.sh PATH/TO/app.ipk
# Needs root SSH (Homebrew Channel provides it). Nothing on the TV reaches the internet.
set -eu
ipk=${1:?usage: TV_HOST=... install-tv.sh app.ipk}
host=${TV_HOST:?set TV_HOST to the TV address}
user=${TV_ROOT_USER:-root}
id=$(basename "$ipk" | cut -d_ -f1)
remote=/tmp/$(basename "$ipk")

scp -q "$ipk" "$user@$host:$remote"
# luna-send prints nothing without a TTY, hence -tt. -i keeps the subscription open until the install settles.
ssh -tt "$user@$host" "luna-send -w 60000 -i luna://com.webos.appInstallService/dev/install '{\"id\":\"$id\",\"ipkUrl\":\"$remote\",\"subscribe\":true}' | grep -m1 -E '\"(installed|failed)\"|errorText'; rm -f $remote"
# A sideloaded service is callable only by its own package until its methods are made public, which is how
# Homebrew Channel exposes its own service. The stock Settings app and the compositor need to reach the Look service.
ssh "$user@$host" "if [ -d /media/developer/apps/usr/palm/services/$id.service ]; then
  printf '{\"public\":[\"%s/*\"]}' $id.service > /var/luna-service2-dev/api-permissions.d/$id.service.api.public.json
  # The bus only reads permission files listed in the package's manifest.
  node -e 'var f=process.argv[1],p=process.argv[2],fs=require(\"fs\"),m=JSON.parse(fs.readFileSync(f));if(m.apiPermissionFiles.indexOf(p)<0){m.apiPermissionFiles.push(p);fs.writeFileSync(f,JSON.stringify(m))}' /var/luna-service2-dev/manifests.d/$id.json /var/luna-service2-dev/api-permissions.d/$id.service.api.public.json
  timeout -t 120 ls-control scan-services >/dev/null 2>&1 || echo 'ls-control scan-services did not finish'
fi"
echo "launch with: ssh -tt $user@$host \"luna-send -n 1 luna://com.webos.applicationManager/launch '{\\\"id\\\":\\\"$id\\\"}'\""
