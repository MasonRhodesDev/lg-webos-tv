# B9 bare-metal eMMC single-sector write primitive

Static RE of `b9-raw/a1-lxboot/lxboot_p4.img` (2 MiB, raw aarch64, loaded at
`0x78100000`, SHA256 `cd8f0b2b4fd72fdc2eeb525d9c83a8ec0449b848fffb41ca9a5d09a50c7af947`)
plus the device-tree in `b9-custom-fw/kernel/lg1314.dtb`. Target TV untouched.

## 1. Controller identification

- Phys base: `0xc3600000` (matches `/proc/iomem`).
- DTB node: `mmc@c3600000`, compatible
  `"lge,lg1k-sdhci-5.0-v3"` (plus fallback `"lge,lg1k-dwmmc"`).
  This is a Realtek/LGE SDHCI 3.00 variant with vendor-specific clock
  gating and DMA-mode selection; the Linux bootargs module parameter
  `sdhci.emmc_log=1` confirms a Linux `sdhci-*` family driver. Everything
  the primitive does is issued through **lxboot's own driver**, not raw
  MMIO.
- Live controller size on this TV: `emmc_size=0x1d2000000` bytes (~7.3
  GiB) from kernel cmdline.
- Block size in lxboot driver context: 512 (`DAT_781ee0cc`).

## 2. lxboot functions that implement sector write

All addresses are the lxboot image's VA after it is mapped at
`0x78100000` by its own hib/normal boot. File offset = VA − `0x78100000`.

| VA | File off | Symbol (inferred) | Role |
|---|---|---|---|
| `0x7816bcc0` | `0x6bcc0` | `emmc_write(uint64_t off, uint32_t size, void *buf)` | Public thunk. Sets flags=0, tail-calls core. Stable ABI we invoke from the trampoline. |
| `0x7816ba54` | `0x6ba54` | `emmc_write_core(off, size, buf, flags)` | Chunked bulk write with head/tail RMW via bounce; dispatches through controller vtable `(*DAT_781ee0e0+0x20)` for the real CMD24/CMD25 issue. |
| `0x7816b458` | `0x6b458` | `emmc_check_inited` | Returns `<0` if the driver was never initialized this boot. |
| `0x7816e41c` | `0x6e41c` | `emmc_cmd12_abort` | CMD12 STOP_TRANSMISSION (opcode `0x0c`), not on our path for a single-sector write. |
| `0x7816b4d0` | `0x6b4d0` | `emmc_read` | Companion read; sanity-check target. |

Confirmation it is used for real writes: the reliability-test routine at
`0x78173068` calls `emmc_write(uVar12, 0x20000, piVar6)` in a loop
starting at offset `0x800000`, size 128 KiB — same signature.

Disassembly of the public thunk (REA Ghidra, verbatim):

```
0x7816bcc0: stp x29, x30, [sp, #-0x10]!
0x7816bcc4: mov x29, sp
0x7816bcc8: mov w3, #0x0
0x7816bccc: bl  0x7816ba54
0x7816bcd0: ldp x29, x30, [sp], #0x10
0x7816bcd4: ret
```

A secondary, EARLIER copy of the same driver lives in the 0x78110000–
0x78124fff pre-main-stub region (strings mirror at `0x7811e...`, write
function `FUN_781153d0` at `0x781153d0` via wrapper `FUN_78113298` at
`0x781132b8`, context at `DAT_78125008`). We do **not** target this
copy from the trampoline: its context is populated only by the mask-
ROM-era bootstrap and can be stale by hib-resume time. The main driver
at 0x7816... is what lxboot itself used seconds before ERET, so its
context is guaranteed live.

## 3. Register-level write sequence (for reference)

Reconstructed from the pre-main stub's open-coded sender at
`FUN_781153d0` (the main driver uses the same vtable so these fields
pass through unchanged). Addresses are offsets into the per-channel
command struct — NOT MMIO offsets:

| Struct offset | Value for write-single-block | Meaning |
|---|---|---|
| `+0x2d0` | `0x18` (CMD24) if count==1, else `0x19` (CMD25) | opcode |
| `+0x2d1` | `0x3a` | flags/response-type word (vendor: R1 w/ data + direction) |
| `+0x2d4` | sector number (byte_off >> 9 if ctx+0x14==0, else byte_off) | argument |
| `+0x2d8` | `2` | response length (R1 = 48-bit) |
| `+0x2dc` | `0` | reserved |
| `+0x2e0` | `0` | reserved |
| `+0x2e4` | `10000` | timeout (ms? vendor units) |
| `+0x2e8` | buffer PA (`ctx+8` — scratch bounce or caller buf) | DMA source |
| `+0x2fc` | `2` | direction = write |

After writing those fields the driver calls the controller's
`cmd_submit` indirect (through `DAT_78125320+8` in the stub, through
`DAT_781ee0e0+0x20` in main). This hides the SDHCI standard register
poke sequence (CSR 0x00 arg, 0x04 blksz, 0x06 blkcnt, 0x08 cmdreg,
BufDataPort 0x20, PresentState 0x24, IntStatus 0x30) inside a Realtek
vendor callback we did not fully reverse — but since our primitive
calls through this callback, we do not need to.

**Conclusion**: implementing a from-scratch MMIO sequence is unnecessary
for a one-sector witness, high-risk (vendor DMA-mode + partition-switch
state are undocumented), and would not fit alongside the trampoline in
one 4 KiB hib comp block. The primitive calls `emmc_write` instead.

## 4. Partition start sectors

| Part | Name | Byte offset | Sector (/512) | Size |
|---|---|---|---|---|
| 25 | logo | `0x06500000` | `0x32800` (206848) | 512 KiB |
| 49 | dump | `0x93080000` | `0x498400` (4818944) | 10 MiB |

Confirmed against `b9-raw/a3-parts/a3-session.txt`. These are byte
offsets on the whole-eMMC LBA space and match what lxboot's
`emmc_write` expects as `x0`.

**Picked**: `part25 "logo"`, sector 0. Rationale:
- Unsigned (CRC32+magic only per lxboot RE in
  `lxboot-normal-boot-abi.md`); overwriting one sector only trips the
  stock logo path, which falls back to a regeneration from EPK — no
  boot-chain break.
- Small (512 KiB total) so a full re-flash is quick if we need to
  restore it.
- Readable with plain `dd if=/dev/mmcblk0p25 bs=16 count=1`; no kernel
  driver quirks to confound the observation.

`dump` (part 49) is a viable alternative with slightly better safety
margin (kernel-crash-dump only) but is harder to observe without an
mmcoops/pstore-aware reader.

## 5. Asm files (built this engagement)

- `b9-custom-fw/payload/src/emmc_write.S`
  — thin wrapper exporting `emmc_write(x0=off, w1=size, x2=buf)` that
  `br`s into `0x7816bcc0`. 4 instructions of text.
- `b9-custom-fw/payload/src/witness-emmc.S`
  — payload `_start` that re-anchors SP, flushes the witness buffer,
  loads `(0x06500000, 512, &witness_buf)`, tail-calls `emmc_write`,
  then WFI-hangs on return.

Expected magic at `mmcblk0p25` sector 0: 16 bytes `B9CFW_WITNESS001`
followed by 496 zero bytes.

Both files are written to run with the **MMU and caches ON**, using
lxboot's EL2 translation tables as inherited at hib-resume ERET. This
is required: the lxboot `emmc_write` core dereferences driver-context
pointers at VA `0x781ee0e0` etc., which are only accessible via
lxboot's live mapping. A pre-call `dc civac` sweep over the 512-byte
buffer keeps lxboot's DMA fetch coherent with our `.rodata` fill.

## 6. Integration snippet

`witness-emmc.S` already includes the full `_start`. Called with its
own payload.ld (identical layout to the existing proof-of-life
payload) and linked against `emmc_write.S`:

```
aarch64-linux-gnu-as -o witness-emmc.o witness-emmc.S
aarch64-linux-gnu-as -o emmc_write.o   emmc_write.S
aarch64-linux-gnu-ld -T payload.ld -nostdlib \
  -o witness-emmc.elf witness-emmc.o emmc_write.o
aarch64-linux-gnu-objcopy -O binary witness-emmc.elf witness-emmc.bin
```

Then feed `witness-emmc.bin` to the EPK hib-snapshot builder in place
of `main.S`'s DRAM-witness payload.

## 7. Risks / assumptions / known unknowns

- **Assumes lxboot .text + .bss are intact at ERET**. Prior RE
  (`lxboot-normal-boot-abi.md`) establishes the kernel decompresses to
  `0x30088000`+ and DTB to `0x32000000`+; both are well below lxboot
  at `0x78100000` and lxboot's BSS at `0x781ee000`. No overlap. If a
  future stock lxboot moves itself post-ERET, this breaks silently
  (TV sits at splash forever).
- **Assumes the eMMC controller is in an idle, usable state**.
  lxboot itself just used it to load kernel from part21/22 and did
  not issue a `power_off` / partition-switch-to-boot1 before ERET
  (that would require re-enumeration we cannot do bare-metal). If a
  future lxboot adds such teardown, calls into `0x7816bcc0` will fail
  — the witness simply will not appear. **We have no success/fail
  indicator beyond the sector contents**; adding one would require a
  working UART primitive or a second DRAM witness after the call
  returns.
- **Brick potential: LOW but non-zero**. The target partition is
  unsigned and recoverable. The only way to brick is if `emmc_write`
  misinterprets our offset and lands in a signed partition (e.g. a
  driver bug that masks the high bits). Not observed in RE; counter-
  evidence: the test routine happily writes to `0x800000`+ in prod.
- **MMU-off alternative**: documented but NOT the chosen path. Running
  this primitive with MMU off would require either replicating
  lxboot's driver context inline (infeasible in a 4 KiB payload) or
  rebuilding the entire SDHCI poke sequence including vendor clock-
  gating writes we have not RE'd. Not worth the surface area for one
  sector.
- **Stack**: the thunk pushes 16 bytes. We re-anchor SP to
  `0x30000f00` inside our own decompressed 4 KiB page, well clear of
  the code+data footprint. `emmc_write_core` is non-recursive and
  its stack frame has been observed to fit in <0x100 bytes; we
  budget 0x100 bytes below `0x30000f00` for its activation record.
- **Hang after write**: intentional — second observable. If the TV
  reboots cleanly anyway, suspect an external watchdog; if it sits
  at splash forever, the trampoline reached us. A future iteration
  could PSCI-reset after a brief delay, but losing the hang loses
  the second observable.

## Scope / cleanup

Scope touched: static RE of lxboot image and DTB on the dev box
(files already in `b9-raw/`). No TV traffic. No new accounts, no new
files on any target. Artifacts produced: three new files in The owner's
own repos (`emmc_write.S`, `witness-emmc.S`, this report). Nothing to
revert.
