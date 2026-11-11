# LZ4P Decompressor Reverse Engineering — stock LG B9

## Target binary

The decompressor is **NOT** in `/usr/sbin/update` (`b9-raw/a2-update/update`) —
that binary is the webOS userland update-UI app (NSU/USBUPDATE/SWUPDATE calls,
no LZ4 strings or LZ4P magic anywhere in it, not in `.text`, `.rodata`, strings,
or DWARF). The kernel PAK is decompressed by **lxboot** (the secondary
bootloader), not userland update.

* File: `b9-raw/a1-lxboot/lxboot_p4.img`
* Format: raw ARM64 image (no ELF). I opened it in Ghidra as
  `format=raw-binary architecture=arm64 entry_point=0x0`.
* String evidence in lxboot:
  * `GZIP\0\0\0\0LZOP\0\0\0\0LZ4P\0\0\0\0UNKNOWN\0decomp\0` at **file 0xd3268**
  * `LZ4P Fail. res:%d, offset:%d, ns...` at **file 0xdc1d8**
  * The second string is referenced from the top-level LZ4P dispatcher at
    `0x81738` (inside `0x8157c`); the first (format-name table) is referenced
    from `0x5926c`.

## Functions (lxboot addresses == file offsets, since base is 0x0)

| Addr       | Role                                                       |
|------------|------------------------------------------------------------|
| `0x8157c`  | **`LZ4P_decompress` — top-level container decoder** (checks magic, walks sizes[], dispatches per-block) |
| `0x81130`  | **Normal-block inner decoder, flag=0 variant** (used for kernel PAK) |
| `0x81344`  | Last-block inner decoder, flag=0 variant (variable output length) |
| `0x803b0`  | Normal-block inner decoder, flag=1 variant (bigger window, isolated blocks) |
| `0x80628`  | Last-block inner decoder, flag=1 variant                    |

The flag that selects the pair is `header[0x14]` (the first u32 of the
"reserved[3]" slot). For the stock B9 kernel PAK it is **0** → `0x81130` +
`0x81344`. The `0x803b0`/`0x80628` pair is unused by the kernel PAK but
differs materially (see below).

## Top-level container semantics (`0x8157c`)

```c
// u32 fields at param_1 (the PAK buffer):
//   [0] magic "LZ4P" (== 0x50345a4c little-endian)
//   [1] uncomp_size
//   [2] check             (== header_size + sum(block_sizes))
//   [3] block_size        (per-block uncompressed, 0x40000 for kernel)
//   [4] block_count       N
//   [5] flag              0 => use 0x81130/0x81344, != 0 => use 0x803b0/0x80628
//   [6..7] reserved
//   [8..8+N-1] block_sizes[i] = compressed size of block i
// header_size = 0x20 + 4*N
// data starts at header_size (piVar8 = param_1 + N + 8)

for (i = 0; i < N; i++) {
    comp_sz = block_sizes[i];
    if (i == N - 1) {
        // LAST block — variable output
        produced = last_decoder(src, dst, comp_sz, block_size);  // 4 args
        if (produced < 0) error;
        dst += produced;
        break;
    }
    consumed = normal_decoder(src, dst, block_size);   // 3 args
    if (consumed < 0) error;
    if (consumed != comp_sz) error;                    // STRICT equality
    src += consumed;
    dst += block_size;                                 // ALWAYS block_size,
                                                       // not `consumed`, not
                                                       // produced; dst stride
                                                       // is always block_size
}
```

Exact asm for the per-block check is `0x816c8..0x816d8`:

```
0x816c8  tbnz w20,#0x1f,error     ; negative return => error
0x816cc  cmp  w20,w22             ; cmp return, comp_sz
0x816d0  b.eq success
0x816d4  neg  w20,w20              ; else report -return as the error code
0x816d8  b    error
```

## Inner-decoder control flow (`0x81130`)

This is a conventional LZ4-sequence loop (token = `lit_nib<<4 | match_nib`,
match offset is a 2-byte little-endian u16, literal/match lengths use the
LZ4 `0xff`-chain extension when the nibble equals `0xf`). The important
differences from a generic LZ4 block decoder are:

1. **No "ref-before-dst" check.** The flag=0 inner decoder never validates
   that the match reference lies within the current block. `0x803b0`
   (flag=1 variant) has an explicit check:
   ```
   puVar11 = dst_after_lits - mo;
   if (puVar11 < param_2) goto error;   // ref before block start => error
   ```
   `0x81130` omits that guard entirely. **This is the mechanism by which
   flag=0 blocks effectively share a sliding dictionary** — matches may
   reference bytes written by any previous block, because consecutive blocks
   are decompressed into contiguous memory (`dst` always strides by
   `block_size`, the previous block's output sits immediately behind the
   current `op_start`).

2. **Block termination is driven exclusively by `dst`, not by `ip`.** The
   loop body is in `0x8116c..0x81320`. The only exits are:

   * `cpy = op + lit_len`; if `cpy > dst_end`, **error** (literal overflow).
     Asm: `0x811b8..0x811bc`.
   * `cpy > dst_safe` (= `dst_end - 8`) but `cpy <= dst_end` → **memcpy
     literals and RETURN** `ip - src` (success; this is "end on literals").
     Asm: `0x811c0..0x811d0`.
   * `end_of_match = dst_after_initial_4 + match_nib`; if
     `end_of_match > dst_end`, **error** (match overflow).
     Asm: `0x812a8..0x812ac`.
   * `end_of_match == dst_end` exactly, after slow tail copy → **RETURN**
     success. Asm: `0x812f4..0x812fc`.

   There is no `ip` bound check and no end-of-stream sentinel. In
   particular, `mo == 0` is NOT special-cased; the decoder computes
   `ref = op - 0 = op` and would read uninitialised bytes. No special
   trailing token, no end marker.

3. **Last-block inner decoder (`0x81344`) adds an `ip`-exhausted exit:**
   ```
   if (puVar1 <= puVar10) break;   // ip reached end-of-input
   ```
   (`puVar1 = src + comp_size`.) So the last block decoder stops as soon as
   either it exhausts its allotted input OR it fills its allotted output.
   It returns **bytes produced**, not bytes consumed, and the top-level
   advances `dst` by that return.

4. **Match length math.** `0x81298..0x8129c`:
   ```
   str w0,[x3],#0x4            ; x3 was dst_after_lits; writes initial 4 match bytes
   add x1,x3,w1,SXTW            ; dst_end_of_match = (dst_after_lits + 4) + match_nib
   ```
   i.e. total copied bytes = `4 + (token & 0xf) + extensions`. Standard LZ4
   MINMATCH=4 encoding.

5. **Small-mo (1..3) uses a `dec32` table** `{0,3,2,3}` at `[x29,#0x30..#0x3c]`
   to handle the second 4-byte chunk of the match copy. Standard LZ4
   small-offset trick. mo=1..3 take the fallback at `0x81244`; mo>=4 takes
   the fast path at `0x81290` (4-byte `ldr/str` wildcopy).

6. **Literal wildcopy writes 8 bytes at a time** (`0x811d4..0x811f0`), may
   overshoot `dst_after_lits` by up to 7 bytes, then subtracts the overshoot
   from `ip` so `ip` is semantically correct. The overshoot bytes in `dst`
   are overwritten by the ensuing match or next literal; they never need to
   be read as a match source because `ref = op - mo < op` always.

## Pseudocode of the inner decoder (`0x81130`), Python-portable

```python
def lz4p_block(src, dst, dst_len, op_start):
    """One flag=0 normal block. `op_start` is where this block begins in the
    shared `dst` buffer; match offsets may legally reach before `op_start`.
    Returns bytes of `src` consumed."""
    ip = 0
    op = op_start
    oend = op_start + dst_len
    osafe = oend - 8
    while True:
        tok = src[ip]; ip += 1
        lit = tok >> 4
        if lit == 15:
            while True:
                b = src[ip]; ip += 1
                lit += b
                if b != 0xff: break
        cpy = op + lit
        if cpy > osafe:
            if cpy > oend: raise error("literal overflow")
            dst[op:op+lit] = src[ip:ip+lit]
            return ip + lit
        dst[op:op+lit] = src[ip:ip+lit]
        ip += lit; op = cpy
        mo = src[ip] | (src[ip+1] << 8); ip += 2
        ref = op - mo                       # may be < op_start; that's OK
        ml_nib = tok & 0xf
        ext = 0
        if ml_nib == 15:
            while True:
                b = src[ip]; ip += 1
                ext += b
                if b != 0xff: break
        mlen = 4 + ml_nib + ext
        if op + mlen > oend: raise error("match overflow")
        for k in range(mlen):
            dst[op + k] = dst[ref + k]      # byte-wise handles RLE (mo < mlen)
        op += mlen
        if op == oend:
            return ip
```

## Divergences from openlgtv `LZ4_uncompress`

openlgtv `LZ4_uncompress` (which the repo's current `tools/lz4p-unpack`
port is based on) treats each block as an isolated LZ4 block with a 5-byte
literal tail rule and refuses matches that reference before the current
block's `dst` start, and refuses `mo == 0`. The lxboot flag=0 decoder
(`0x81130`) differs on exactly those two points:

| Behavior | openlgtv `LZ4_uncompress` | lxboot `0x81130` |
|----------|---------------------------|------------------|
| Match ref before block start | Rejected / clamped to 0 | **Allowed** (reads into previous block's output — shared dictionary across blocks). No check in asm at all. |
| Last-N-bytes tail rule | Last 5 bytes must be literals | Last **8** bytes can be literal-only OR exact match end. Threshold is `dst_safe = dst_end - 8`, asm `0x81164`. |
| Fast-match wildcopy width | 4-byte `COPYLENGTH` safety | 4-byte initial + 8-byte `ldr/str` pairs; small-mo path uses `dec32[]={0,3,2,3}`, asm `0x81270..0x8128c`. |
| `mo == 0` | Explicitly rejected | **Not checked.** `ref = op` and the match copy proceeds; practically, a well-formed encoder never emits it, but the decoder does not treat it as an error or sentinel. |
| End-of-block condition | On literal tail (5-byte rule) | On literal tail (8-byte threshold) OR exact `end_of_match == dst_end` (asm `0x812f4..0x812fc`). |

## What that means for the port

`tools/lz4p-unpack` has been updated to decode all non-last blocks into a
single shared output `bytearray`, with no per-block ref bound (match
offsets may walk back into earlier blocks). The last block uses the
input-exhausted / exact-dst-end exit per `0x81344`.

## Verification status — INCOMPLETE

Running the updated tool against the concatenated kernel PAK:

```
./tools/lz4p-unpack \
  <(cat paks-fixed/135_kernel_seg000_of_002.bin \
        paks-fixed/136_kernel_seg001_of_002.bin) \
  /tmp/stock_kernel.bin
```

behaves as follows:

* Blocks **0..40** decompress cleanly: each inner call consumes exactly
  `block_sizes[i]` compressed bytes and produces exactly `0x40000` output
  bytes. Byte `0x38` of the global output already reads `ARM\x64` (correct
  ARM64 Image magic) after block 0, matching the expected final magic.
* Block **41** is where the port diverges from the on-wire stream.
  The decoder reaches `dst = block_start + 262130` after ~157770 of block
  41's 157923 compressed bytes, and the very next token (`0x0c` at file
  offset `0x60f05c`, i.e. absolute byte `block_start + 157767`) encodes a
  16-byte match that would overflow the block's 262144-byte output
  (`match_end = 262146 > 262144`). The lxboot asm at `0x812a8..0x812ac`
  treats that as an error, and the top-level's `consumed != comp_size`
  check at `0x816cc..0x816d8` would also reject the 153-byte shortfall.
* Blocks **42, 43** show similar shortfalls of 39 and 47 bytes before block
  44's decode hits a stored match offset of `0x0000` at ~32 bytes into the
  block.

I did not resolve what the real decoder does with these three blocks
before the mo=0 token in block 44. The possibilities I could not confirm
from static analysis alone:

1. There is a per-block or per-segment framing byte(s) I am missing at the
   start of the "problem" blocks — the 153/39/47 trailing bytes look like
   real ARM64 code, not padding, which argues that my parser is terminating
   *early* and the LG decoder sees a different ip/op trajectory from the
   same bytes.
2. An inner-decoder quirk I did not spot statically (e.g. a specific
   token-byte sequence acting as a stream-reset, or an overshoot behavior
   where the wildcopy's 8-byte-past-dst_end writes actually count toward
   next block). Nothing in the asm of `0x81130` supports either of these,
   but the empirical shortfall is real.
3. A property of these segmented PAKs on-wire: block 41 happens to straddle
   the `135`/`136` segment boundary (file offset `0x5FFFFC`). If segmenting
   on original NAND introduced an alignment gap that `paks-fixed/` did not
   reintroduce, the concatenation seen here would be missing some bytes.
   Worth checking the original EPK partition layout.

So the deliverable produces **incorrect** output starting at block 41's
output region. The first 40 blocks (10,485,760 bytes starting at dst=0,
including the ARM64 header and the decompressed `Image` prologue) are
correct and that is what the `byte 0x38 == ARM\x64` verifier would see if
it only checked the Image header. Do not rely on bytes past `dst =
0xA00000` (≈10 MiB in) without further work.

## Loose ends to chase next

* Dump original on-disk layout of the kernel PAK partition on the TV (via
  mtdblock or the EPK extractor's intermediate state) and bytewise-compare
  against the `paks-fixed/135+136` concatenation around file offset
  `0x5FFFFC` — if there's a segment gap, the three suspicious blocks are
  explained.
* Trace `0x81130` under QEMU-user with the actual block 41 compressed
  payload fed in; compare the live decoder's ip/op trajectory against the
  port's.
* Audit the openlgtv/sbin-update-related sources the repo already based on
  for any "shared dictionary" handling that was removed when this PAK
  variant became the kernel variant.
