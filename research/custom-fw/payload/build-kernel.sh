#!/usr/bin/env bash
# Build the trampoline and pack it together with a kernel Image + DTB into
# a hib image. Layout:
#   0x28000000  trampoline      (one 4 KiB page)
#   0x30088000  kernel Image    (aligned_base 0x30000000 + text_offset 0x88000)
#   0x32000000  DTB             (fits in one 1 MiB window)
#
# Required inputs (overridable via env vars):
#   KERNEL_IMAGE   default $PROJECT/kernel/Image
#   KERNEL_DTB     default $PROJECT/kernel/lg1314.dtb
# Optional:
#   KERNEL_INITRD  if set, included at 0x33000000 (kernel must know via cmdline)

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/.." && pwd)"
OUT="$HERE/build"
mkdir -p "$OUT"

KERNEL_IMAGE="${KERNEL_IMAGE:-$PROJECT/kernel/Image}"
KERNEL_DTB="${KERNEL_DTB:-$PROJECT/kernel/lg1314.dtb}"
KERNEL_INITRD="${KERNEL_INITRD:-}"

for f in "$KERNEL_IMAGE" "$KERNEL_DTB"; do
    [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
done

CROSS="${CROSS:-aarch64-linux-gnu-}"
AS="${AS:-${CROSS}as}"
LD="${LD:-${CROSS}ld}"
OBJCOPY="${OBJCOPY:-${CROSS}objcopy}"

for t in "$AS" "$LD" "$OBJCOPY" python3; do
    command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 1; }
done

echo "[*] Building trampoline..."
"$AS" -march=armv8-a -o "$OUT/trampoline.o" "$HERE/src/trampoline.S"
"$LD" -T "$HERE/src/trampoline.ld" -nostdlib -static \
    -o "$OUT/trampoline.elf" "$OUT/trampoline.o"
"$OBJCOPY" -O binary "$OUT/trampoline.elf" "$OUT/trampoline.bin"
echo "    trampoline.bin: $(stat -c%s "$OUT/trampoline.bin") bytes"

pack_args=(
    --entry 0x28000000
    --out "$OUT/hib.img"
    "0x28000000:$OUT/trampoline.bin"
    "0x30088000:$KERNEL_IMAGE"
    "0x32000000:$KERNEL_DTB"
)
if [ -n "$KERNEL_INITRD" ] && [ -f "$KERNEL_INITRD" ]; then
    pack_args+=("0x33000000:$KERNEL_INITRD")
fi

echo "[*] Packing hib..."
"$PROJECT/tools/hib-pack-multi" "${pack_args[@]}"

echo
echo "[+] hib.img ready at $OUT/hib.img"
sha256sum "$OUT/hib.img"
echo "[+] sizes:"
printf "    trampoline  %10s bytes\n" "$(stat -c%s "$OUT/trampoline.bin")"
printf "    kernel      %10s bytes  (%s)\n" "$(stat -c%s "$KERNEL_IMAGE")" "$KERNEL_IMAGE"
printf "    dtb         %10s bytes  (%s)\n" "$(stat -c%s "$KERNEL_DTB")" "$KERNEL_DTB"
[ -n "$KERNEL_INITRD" ] && printf "    initrd      %10s bytes  (%s)\n" "$(stat -c%s "$KERNEL_INITRD")" "$KERNEL_INITRD"
