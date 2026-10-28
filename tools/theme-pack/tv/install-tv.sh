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
echo "launch with: ssh -tt $user@$host \"luna-send -n 1 luna://com.webos.applicationManager/launch '{\\\"id\\\":\\\"$id\\\"}'\""
