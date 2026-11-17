#!/usr/bin/env bash

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="$(cd "$HERE/.." && pwd)"
OUT="$HERE/build"
mkdir -p "$OUT"

CROSS="${CROSS:-aarch64-linux-gnu-}"
AS="${AS:-${CROSS}as}"
LD="${LD:-${CROSS}ld}"
OBJCOPY="${OBJCOPY:-${CROSS}objcopy}"
OBJDUMP="${OBJDUMP:-${CROSS}objdump}"

for t in "$AS" "$LD" "$OBJCOPY" python3; do
    command -v "$t" >/dev/null || { echo "missing: $t" >&2; exit 1; }
done

"$AS" -march=armv8-a -o "$OUT/main.o" "$HERE/src/main.S"
"$LD" -T "$HERE/src/payload.ld" -nostdlib -static -o "$OUT/payload.elf" "$OUT/main.o"
"$OBJCOPY" -O binary "$OUT/payload.elf" "$OUT/payload.bin"

size=$(stat -c%s "$OUT/payload.bin")
echo "payload.bin: $size bytes"
[ "$size" -le 4096 ] || { echo "payload exceeds one 4 KiB page" >&2; exit 1; }

"$PROJECT/tools/hib-pack" --payload "$OUT/payload.bin" --out "$OUT/hib.img"

echo
echo "Disassembly:"
"$OBJDUMP" -d "$OUT/payload.elf"
echo
echo "Outputs under $OUT/"
ls -la "$OUT/"
sha256sum "$OUT/hib.img"
