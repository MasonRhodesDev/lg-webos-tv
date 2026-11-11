# research

Notes and tools that worked below webOS, on the owner's own TV, using LG's
published firmware image. Everything here operates on vendor-shipped files or
read-only probes; the published artifacts a stranger would run on their own TV
live under `scripts/` and `tools/`.

This tree is separate from the top-level tools because it carries higher brick
risk, needs a firmware image the reader must bring themselves, and depends on
keys published elsewhere.

## Contents

- `epk/` — **read-only** static analysis of LG's EPK3-new container on the B9.
  Decrypts a stock `.epk` with a key the user supplies (`--key-file` or
  `EPK_AES_KEY`), carves the per-PAK bodies, and decompresses the LZ4P kernel
  blob. Notes on `lxboot`'s normal-boot ABI and the eMMC write primitive the
  bootloader itself calls. Nothing here writes to a TV.
- `custom-fw/` — **writes p48 and p11 on the TV**. A prototype hibernate-image
  installer that rides the stock snapshot-boot path to inject a small payload.
  Reading-only parts (docs, disassembly, UART notes) are safe on their own; the
  installer and payload builder are not. **Do not run any installer here unless
  you can reflash the eMMC directly.** See `custom-fw/docs/status.md`.
- `notes/` — background references used during the above work: a full partition
  inventory with mount points and FS types, and a map of the public rooting and
  firmware-extraction projects relevant to this generation of TVs.

## What is not in the repo

Firmware images (`.epk`), decrypted EPK bodies, kernel `Image` artifacts, device
tree blobs and hibernate images are gitignored — they are LG's copyrighted
files and may hold device secrets. The tools expect you to point them at a copy
of the firmware on disk; the top-level `.gitignore` carries the patterns.

## Keys

The EPK AES key is not shipped here. It is a per-platform constant published by
third-party LG EPK extraction projects — fetch it from one of those and pass it
to `epk/tools/epk-decrypt` with `--key-file` or `EPK_AES_KEY`.

## Dependencies

A cross-toolchain for `aarch64-linux-gnu` (binutils and gcc), `python3`, `lz4`,
and `python3-cryptography`. Package names vary by distribution.
