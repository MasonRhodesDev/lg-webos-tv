#!/bin/sh

set -e

HIB=/var/lib/webosbrew/custom-fw/hib.img
LOG=/var/lib/webosbrew/custom-fw/persist.log

exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) boot: pid=$$ ==="

if [ ! -f "$HIB" ]; then
    echo "no $HIB; nothing to do"; exit 0
fi

hib_size=$(stat -c%s "$HIB" 2>/dev/null || echo 0)
if [ "$hib_size" != "157286400" ]; then
    echo "hib size wrong ($hib_size); refusing to install"; exit 0
fi

if dd if="$HIB" of=/dev/mmcblk0p48 bs=1M 2>/dev/null; then
    echo "hib rewritten ($hib_size bytes)"
else
    echo "hib rewrite failed"; exit 0
fi

printf '\x53' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=427  conv=notrunc 2>/dev/null || true
printf '\x01' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=2441 conv=notrunc 2>/dev/null || true
sync
echo "resume-pending bytes set (0x1AB='S', 0x989=1)"
