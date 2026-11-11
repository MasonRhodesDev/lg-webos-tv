#!/bin/sh
# persist-init.sh — runs every boot under webosbrew's HBC init.d loader.
#
# Rewrites the hib partition from a local copy of our firmware image and
# asserts the two "resume pending" bytes so the next cold boot will load
# our image. Without this hook, LG's own periodic snapshot regeneration
# eventually overwrites our hib with a saved stock kernel image.
#
# Installation (manual, once):
#   scp installer/persist-init.sh         root@TV:/var/lib/webosbrew/init.d/90-custom-fw
#   scp payload/build/hib.img             root@TV:/var/lib/webosbrew/custom-fw/hib.img
#   chmod +x /var/lib/webosbrew/init.d/90-custom-fw
#
# Must never prevent a boot: all failure paths exit 0.

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

# Rewrite hib. Non-fatal if it fails.
if dd if="$HIB" of=/dev/mmcblk0p48 bs=1M 2>/dev/null; then
    echo "hib rewritten ($hib_size bytes)"
else
    echo "hib rewrite failed"; exit 0
fi

# Set resume-pending bytes.
printf '\x53' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=427  conv=notrunc 2>/dev/null || true
printf '\x01' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=2441 conv=notrunc 2>/dev/null || true
sync
echo "resume-pending bytes set (0x1AB='S', 0x989=1)"
