# LG B9 (M19 generation) EPK3-new format

Notes from openlgtv/epk2extract (`src/epk{2,3}.c`, `src/epk.c`,
`include/epk3.h`, `include/epk.h`) cross-checked against the stock B9
EPK body in `b9-epk-research/work/decrypted.bin` (1,018,996,950 bytes,
174 PAK records).

## Platform / key

- Platform ID in the EPK header identifies the key family used across
  this generation of LG TVs; the per-family AES-128 key is published in
  third-party firmware-extraction projects (for example, open-source LG
  EPK extractors that ship a `keys/AES.key` file). Load it through
  `--key-file` or `EPK_AES_KEY` — see the tool header.
- One quick sanity check: encrypt 16 zero bytes under the key and
  compare the result to the first 16 bytes of any stock EPK's AES
  ciphertext region (both are the ECB encryption of zero, so they
  must match).

## File layout (EPK_V3_NEW)

```
offset         size              what
----------------------------------------------------------------
0x000          0x100             outer file signature (RSA-2048)
0x100          1460              EPK_V3_NEW_HEADER_T         [AES]
0x6B4          16                platformVersion             (plain)
0x6C4          16                sdkVersion                  (plain)
0x6D4          0x100             packageInfo signature       (plain)
0x7D4          12                packageInfo list header
                                   list_size   = 0xDC44
                                   count       = 174
                                   pakInfoMagic= 0x206921D5
0x7E0          174 * 324         PAK records (PAK_V3_HEADER_T) [AES]
0xE418         ...               segment bodies (see below)   [AES]
EOF-5          5                 trailer
```

The AES window for the header spans 1460 bytes starting at 0x100; only
the first floor(1460/16) = 91 full ECB blocks are decrypted. The AES
window for packageInfo spans `packageInfoSize` (= 0xDC44) bytes starting
at 0x7D4; only 3524 full blocks are decrypted, so the tail 4 bytes
(0xE414..0xE418) stay as ciphertext.

### Segment stride (per upstream `extractEPK3` for `EPK_V3_NEW`)

```
cursor = body_start                       # 0xE418 for B9 stock
for each record i in 0..count-1:
    [cursor, cursor + 0x100)              per-segment RSA-2048 sig (plain)
    [cursor + 0x100, cursor + 0x100 + segmentSize)
                                          AES-ECB window (one call to
                                          wrap_decryptimage with that
                                          exact byte offset as its base;
                                          there is no shared alignment
                                          "grid" — each call restarts
                                          the ECB stream at its own
                                          offset).
                                          First 4 bytes of the decrypted
                                          window are the global segment
                                          counter i (uint32 LE). The
                                          remaining segmentSize-4 bytes
                                          are the real partition data.
    [cursor + 0x100 + segmentSize,
     cursor + 0x100 + segmentSize + 4)    "extraSegmentSize" inter-seg
                                          gap (not inside any
                                          wrap_decryptimage window, so
                                          those 4 bytes remain
                                          ciphertext in the decrypted
                                          body).
    cursor += 0x100 + segmentSize + 4
```

Upstream (`src/epk3.c`, around the `mwrite` call) writes `segmentSize`
bytes starting at `dataPtr + 4` — the 4 bytes past the end of the AES
window get written untouched. Our `tools/epk-extract` writes only the
`segmentSize - 4` bytes that lie inside the AES window, which is what
matches the on-device MTD content.

## B9 record table (survey)

174 records, selected notable ones:

| idx | name            | segidx/count | segmentSize | body offset | grid |
|-----|-----------------|--------------|-------------|-------------|------|
| 0   | partinfo        | 0/1          | 0x3050      | 0xe518      | 8    |
| 1   | tzfw            | 0/1          | 0xd03c0     | 0x11568     | 8    |
| 2–132 | rootfs        | 0..130 / 131 | 0x600000    | varies      | 0–12 |
| 133–134 | swue        | 0..1 / 2     | var         | varies      | 0–12 |
| 135–136 | kernel      | 0..1 / 2     | var         | 0x31b4a464…0x3214a568 | 4,8 |
| 169 | lxboot          | 0/1          | 0xe2070     | 0x3ca8099c  | 12   |
| 170 | secureboot      | 0/1          | 0xa000      | 0x3cb62b10  | 0    |
| 171 | sedata-atsc     | 0/1          | 0x10780     | 0x3cb6cc14  | 4    |
| 172 | logo            | 0/1          | 0x1f985     | 0x3cb7d498  | 8    |
| 173 | micom           | 0/1          | 0x2d9b1     | 0x3cb9cf21  | 1    |

`body_start = 0x7D4 + 12 + 174*324 = 0xE418`. Each segment body offset
is the sum `body_start + Σ(0x100 + segmentSize_j + 4)` for all
preceding segments j.

The grid (body_offset % 16) cycles 0 → 4 → 8 → 12 → 0 across
consecutive same-sized segments because the stride for a 0x600000-byte
rootfs segment is `0x100 + 0x600000 + 4 = 0x600104`, and `0x600104 mod
16 = 4`.

## Encryption layering

One AES-128-ECB layer per wrap_decryptimage call, keyed with the M19
platform key above. No per-PAK key, no CBC IV, no second pass. All PAK
bodies — kernel, lxboot, rootfs, micom, secureboot, logo — use the same
key. Verified empirically: our extracted `169_lxboot.bin` matches the
first 256 bytes of the on-TV `lxboot_p4.img` partition dump exactly
after a single ECB decrypt at the segment's own body offset; divergence
begins at `0x2a0` and corresponds to device-specific MTD content past
the shipped boot payload (the EPK carries 925,804 bytes while the
partition is 2,097,152 bytes on flash).

Decrypted-magic survey:

| name          | first 8 bytes                    | interpretation          |
|---------------|-----------------------------------|-------------------------|
| partinfo      | `16 07 12 20 00 00 00 00`         | date-prefixed partmap   |
| tzfw          | `1c 00 00 14 1f 20 03 d5`         | AArch64 branch / BL31   |
| kernel seg 0  | `4c 5a 34 50`                     | `LZ4P` compressed       |
| lxboot        | `00 00 00 00 33 70 16 6d`         | matches `lxboot_p4.img` |
| secureboot    | `00 00 00 00 33 70 16 6d`         | sibling of lxboot       |
| logo          | `4c 5a 34 50 18 80 81 00`         | `LZ4P` compressed       |
| micom         | `34 30 33 31 3a 30 34 30` (`"4031:040"`) | MCU firmware version string |

## Previous `tools/epk-decrypt` (the REGIONS table)

The earlier incarnation of this tool approximated the per-segment stream
with ~16 region tuples `(start, end, grid_mod_16)` that decrypted the
whole file as one grid-aligned ECB stream per tuple. That works exactly
for the leading header + packageInfo regions (grid 0 and grid 4 are the
real alignments), but inside the body each segment has its own
alignment: rootfs segments cycle through grids 0/4/8/12, and other
segments land on arbitrary offsets. Three quarters of the main body
(`0x17e50f94..0x3cb85e74` — the single "grid 4" span that covered most
rootfs) was decrypted at the wrong alignment, so those blocks were
AES-ECB-decrypted with a 4- or 8-byte shift relative to the real
segment base. The result is correct for ~1 in 4 blocks and random for
the rest.

The current `--fix-partial` mode encrypts every legacy region back at
its legacy alignment (restoring the original ciphertext across the
whole file), then runs the correct per-segment decrypt. For a clean
original encrypted EPK, the `--full --assume-encrypted` path does the
one-pass decrypt directly from the file.
