# lxboot normal-boot kernel ABI — static RE deltas vs b9cfw hib-resume trampoline

Source: `lxboot_p4_body.bin` sha256 `bd603f50604e1d747a0acb0f0fe105b7f7027e0a10b3597302822aa9fddd7a76`
(the already-carved lxboot body used by prior A1 passes). REA/Ghidra 12.1.2, raw-binary
arm64, base-offset 0. Live-binary linker base inferred from absolute pointer `0x7818f288`
in the FDT-update table resolving to the `/memory` string at file offset `0x8f288` →
**lxboot runtime base = `0x78100000`**. All offsets below are Ghidra file-offset addresses
(subtract `0x78100000` from any runtime pointer the binary stores to get the same offset).
DTBs read from `b9-custom-fw/kernel/lg1314.dtb[.orig]`.
Kernel header read from `b9-custom-fw/kernel/Image`
(text_offset `0x88000`, image_size `0x1963000`, flags `0x2` = LE/4K/anywhere, ARM64 magic OK).

---

## 1. Normal-boot ERET site (call chain, pseudocode, actual instructions)

Reached from `FUN_0xc9d4` (autoboot) on the non-snapshot branch, which calls
`FUN_0xb548(argc=3, argv={"boot","flash",""})`. That is the "boot" command handler; it
loads and SHA-verifies the kernel, builds the Linux cmdline, then at `LAB_0xc980` tail-calls
`FUN_0xb4f4()` (timelog print only) and `FUN_0xb154(kernel_entry_pa, cmdline_ptr)` — the
kernel launcher. The actual CPU hand-off is `FUN_0x380`.

### FUN_0xb154 — `start_linux(entry, cmdline)` (file +0xb154)

Observed instructions (edited for commentary):

```
stp     x29,x30,[sp,-0x60]!
mov     x20, x0                  ; x20 = kernel_entry_pa (0x8000000 on stock, i.e. 128 MiB base)
mov     x19, x1                  ; x19 = cmdline pointer
bl      FUN_0x21eec              ; drain pending deferred services (not cache/MMU)
mov     x0, #0x1000              ; DTB destination phys = 0x1000  (!)
mov     x1, x20
mov     x2, x19
bl      FUN_0xd508               ; setup_dtb(dtb_dest=0x1000, kernel_entry, cmdline)
cbnz    w0, exit
bl      FUN_0xaf3c               ; install_tzfw()  (load /tz/tzfw.bin to EL3 0x7e8e0000 area)
tbnz    w0, #0x1f, exit
bl      FUN_0xfae4               ; arch_flag: 0=AArch64, 1=AArch32
sxtw    x0, w0
str     x0,  [x29,#0x20]         ; frame[0] = arch
mov     x1, #0xbba
str     x1,  [x29,#0x28]         ; frame[1] = 0xbba  (ATAG/machtype for the AArch32 branch; ignored by AArch64)
str     x20, [x29,#0x30]         ; frame[2] = kernel_entry
mov     x1, #0x1000
str     x1,  [x29,#0x38]         ; frame[3] = DTB phys = 0x1000
...
add     x0, x29, #0x20
bl      FUN_0x380                ; hand off to CPU
```

### FUN_0x380 — kernel CPU hand-off (file +0x380, verbatim)

```
0x380: ldr x10,[x0],#0x8        ; x10 = frame[0] = arch_flag
0x384: ldr x11,[x0],#0x8        ; x11 = 0xbba      (AArch32 only)
0x388: ldr x12,[x0],#0x8        ; x12 = kernel_entry_pa
0x38c: ldr x13,[x0],#0x8        ; x13 = DTB phys (= 0x1000)
0x390: cbnz x10, aarch32_branch

; ---- AArch64 path ----
0x394: mrs  x0, hcr_el2
0x398: orr  x0, x0, #0x80000000 ; HCR_EL2.RW = 1 (EL1 would be AArch64 if we ever dropped)
0x39c: msr  hcr_el2, x0
0x3a0: mov  x0, #0x3c9          ; SPSR value: DAIF masked, M[4:0]=01001 = EL2h AArch64
0x3a4: msr  elr_el2, x12
0x3a8: msr  spsr_el2, x0
0x3ac: mov  x0, x13              ; *** x0 = DTB phys ***
0x3b0: mov  x1, xzr              ; x1 = 0
0x3b4: mov  x2, xzr              ; x2 = 0
0x3b8: mov  x3, xzr              ; x3 = 0
0x3bc: isb
0x3c0: eret                       ; -> kernel entry, arm64 Image boot protocol
```

The ERET is the one and only hand-off on normal boot. There is no trampoline copy in
scratch RAM, no spin-table, no cache-off explicit flush adjacent to this site — the
cache/TLB/I-cache management lives in lxboot's own pre-ERET setup (see §3).

The `eret` is reached from EL3 (lxboot's reset vector at `FUN_0x20` does
`mrs x0,currentel; cmp x0,#0xc; b.ne 0x340` and dead-loops if not EL3), with EL2 state
pre-staged. Linux head.S therefore wakes at **EL2h, AArch64, DAIF=0b1111, x0=DTB,
x1=x2=x3=0, HCR_EL2.RW=1**.

The `boot flash` path's cold-boot pre-ERET sequence as a whole is:

```
FUN_0xc9d4            autoboot
  FUN_0xb548          "boot" command handler
    (load kernel 0x8000000, SHA-verify)
    (build cmdline, root=/dev/mmcblkXpY rootfstype=squashfs …)
    FUN_0x21e68       service tick (poll deferreds, non-cache)
    FUN_0xb4f4        timelog print
    FUN_0xb154        start_linux(entry, cmdline)
      FUN_0x21eec     service drain
      FUN_0xd508      setup_dtb(0x1000, entry, cmdline)   ← all FDT writes live here
      FUN_0xaf3c      install_tzfw                         ← SMC path for the kernel
      FUN_0xfae4      arch_flag read
      FUN_0x380       hand-off (above)
```

---

## 2. DTB preparation — every write lxboot performs on normal boot

All writes come out of **`FUN_0xd508(dest=0x1000, entry, cmdline)`** (file +0xd508). The
DTB source blob was already loaded into scratch RAM by `FUN_0xd508`'s preamble (`FUN_0x236d4`
reserves up to `0x200000` of scratch at `_DAT_0xadd88`); the ORIG DTB bytes come from
*wherever lxboot's load path put them*. Empirical selection: lxboot's loader picks the
**AArch64 DTB at lxboot offset `0xb760c`** and ignores the AArch32 DTB at `0xb2f38`. There
is no `d00dfeed` scan and no partinfo entry — the DTB is chosen by lxboot's fixed-slot
pointer that is populated at build time from the right `*.dtb` artefact. The brief's
dtb.orig (18132 bytes, root `/chosen bootargs = [00]`, MMC tuning values already present,
`reserved-memory/kdrv_buffer{1,2}` present with `reg=<0 0>`, `psci` node, PSCI
enable-method on cpu@1..3) matches that slot byte-for-byte to within the bits we rewrite
below, confirming the AArch64 variant.

### 2.1 Writes performed by lxboot, in order

| Call site (FUN_0xd508 body) | FDT op | Node path | Property | Source of value |
|---|---|---|---|---|
| `bl FUN_0x236d4` | reserve scratch | — | — | `_DAT_0xadd88`, ≤0x200000 |
| `bl FUN_0x6d34` → `FUN_0x24180` ×2 | **`add_dtb_property`** | `/reserved-memory/kdrv_buffer1@1` | **`no-map`** | zero-length |
| `bl FUN_0x6d34` → `FUN_0x24180` | **`add_dtb_property`** | `/reserved-memory/kdrv_buffer2@2` | **`no-map`** | zero-length |
| only if resume-NVM: `bl FUN_0x23870` | `add_dtb_property` | `/amba/gpio@fd430000` | **`skip-resume`** = `0xFFFFFFC0` (u32 cell) | `FUN_0x1fb4(8)==1` gate (CID GPIO bit) |
| `bl FUN_0x23d88` | **`set_property_string`** | `/chosen` | **`bootargs`** | `cmdline` built in `FUN_0xb548` |
| `bl FUN_0x23b50` | `set_property_bytes` | `/soc/ethernet` *(resolves to `ethernet@c3700000`)* | `mac-address` | 6 bytes from `FUN_0x455b8`+`FUN_0x45a54` (NVM ethaddr) |
| `bl FUN_0x23948` | `set_property_u32` | `/soc/mmc` *(resolves to `mmc@c3600000`)* | `delaycell-50Mhz` | `0` |
| `bl FUN_0x23948` | `set_property_u32` | `/soc/mmc` | `device-ds` | `FUN_0x2cb58()` |
| `bl FUN_0x23948` | `set_property_u32` | `/soc/mmc` | `tab-delay` | `FUN_0x2f3a4()` |
| `bl FUN_0x23948` | `set_property_u32` | `/soc/mmc` | `clock-frequency` | `FUN_0x2e904()` |
| `bl FUN_0x24340(table)` | **`set_property_u32_array`** ×N | see §2.2 | `reg` | runtime memory map |
| optionally `do { FUN_0x24000("/amba/i2c")}while(0)` | `fdt_del_node` | `/amba/i2c@…` | — | nvm `use_legacy_i2c`=1 |
| optionally `do { FUN_0x24000("/amba/gpio")}while(0)` | `fdt_del_node` | `/amba/gpio@…` | — | nvm `use_legacy_gpio`=1 |
| `bl FUN_0x24394(0x1000)` | **`memmove(dest, blob, total_be_size)`** | — | — | copies final blob to phys `0x1000` |

Field offsets *inside the DTB itself* are not stored by lxboot; it uses libfdt-style
path lookup (`FUN_0x42764` = `fdt_path_offset`, `FUN_0x43b40` = `fdt_setprop`,
`FUN_0x43c50` = `fdt_appendprop`). Offsets below are the ones *in our patched*
`lg1314.dtb`, measured with `dtc -I dtb -O dts`:

- `/memory/reg` property value (patched): `<0x00000000 0x3e400000  0x63000000 0x1b800000  0xaf000000 0x11000000>` — 6 × 32-bit cells (root `#address-cells=1 #size-cells=1`), encoding three (base,size) pairs totalling 1012 MiB + 440 MiB + 272 MiB.
- `/chosen/bootargs` (patched): full cmdline — matches brief.
- `/reserved-memory/kdrv_buffer{1,2}/reg` still `<0x00 0x00>` in both orig and patched (stock lxboot doesn't rewrite these cells; it only appends `no-map`).

### 2.2 Memory table lxboot walks (file +0xa0c90 for `_DAT_0xa1cac==4`)

Table format = sequence of 32-byte records, terminator = NULL `path`. Each record is
`(path_ptr, prop_ptr, data_ptr, u32_count)`. Decoded from the bytes
`88f21878 00000000 90f21878 00000000 c80d1a78 00000000 06 00 00 00 00 00 00 00 …`:

| # | Path (runtime addr → file offset) | Property | Data ptr → file offset | Count | Decoded cells |
|---|---|---|---|---|---|
| 0 | `0x7818f288` → `/memory` | `reg` | `0x781a0dc8` → `0xa0dc8` | 6 | runtime-filled; 3 (base,size) u32 pairs matching bootargs' `hma=` layout |
| 1 | `0x7818f298` → `/reserved-memory/kdrv_buffer1` | `reg` | `0x781a0dc0` → `0xa0dc0` | 2 | runtime-filled; one (base,size) pair |
| 2 | `0x7818f2b8` → `/reserved-memory/kdrv_buffer2` | `reg` | `0x781a0db8` → `0xa0db8` | 2 | runtime-filled; one (base,size) pair |
| 3 | `0x00000000` | — | — | — | NULL terminator |

The `_DAT_0xa1cac==6` branch (table at file +0xa0d10) adds one extra pair and also
does `DAT_0xa0d9c += 0x27000000` (an LPAE-mode variant); M19/B9 uses the 4-branch.
`FUN_0x23c34` byte-swaps each u32 from host-LE to FDT-BE before `fdt_setprop`.

### 2.3 What lxboot does **not** write into the DTB

- No `/chosen/linux,initrd-start`, no `/chosen/linux,initrd-end` on a flash boot (ram
  boot handled separately upstream). Our bootargs never asks for an initrd, so this is
  not a gap.
- No phandle fixups (`__fixups__`, `__symbols__` nodes untouched).
- No CPU `enable-method` churn — stock DTB has `psci` on cpu@1..3 already.
- No `/psci/*` edits — stock PSCI node (`arm,psci`, smc, `cpu_suspend/off/on=0xC4000001..3`) is used as-is.
- No HMA-specific `/reserved-memory` entries — HMA is parsed from `bootargs` by LG's
  kernel driver via `memblock_reserve`, not DT.
- No cache info, no `/timer` write — kernel reads these from the fixed DTB nodes.
- **No cells into `kdrv_buffer{1,2}/reg`.** Those stay `<0 0>` even on stock. `no-map`
  is attached regardless.

### 2.4 Delta: our patched DTB vs stock-written DTB

| Field | Stock lxboot writes | Our patched DTB has | Severity |
|---|---|---|---|
| `/chosen/bootargs` | full cmdline | full cmdline + `b9cfw=1` marker | **none** |
| `/memory/reg` | 3 × (base,size) u32 pairs from runtime map | 3 × same pairs (brief: filled from `/proc/iomem`) | **likely fine if values match** |
| `/reserved-memory/kdrv_buffer{1,2}/no-map` | **added** by lxboot via `fdt_appendprop` | **missing** in patched (not added by brief's patcher) | **medium — see §4** |
| `/reserved-memory/kdrv_buffer{1,2}/reg` | left as `<0 0>` | `<0 0>` | none |
| `/soc/ethernet/mac-address` | 6 bytes from NVM `ethaddr` | `[00 00 00 00 00 00]` | low (bootargs sets `ethaddr=20:17:42:D0:4A:44` which the driver reads first) |
| `/soc/mmc/{clock-frequency,tab-delay,device-ds,delaycell-50Mhz}` | runtime-tuned values | ORIG baked-in values | low (driver re-tunes) |
| `/amba/gpio@fd430000/skip-resume` | added only on resume-NVM boot | absent | **none** (cold boot doesn't need it) |
| `/amba/i2c@…`, `/amba/gpio@…` nodes | deleted iff nvm legacy flag set | nodes kept | low (legacy flag off on B9) |

The structural writes our patcher is missing from the stock flow are: **(a) `no-map`
on both `kdrv_buffer` reserved-memory children**, (b) MMC tuning cells, and (c) a NVM
MAC address. Of those, only (a) can bite before a UART-less kernel reaches the point
it would have been printing. (b) and (c) affect subsystems that come up well after
console init.

---

## 3. CPU state at kernel ERET on normal boot

Observed from `FUN_0x20` (reset/EL3-init) and `FUN_0x380` (ERET site), cross-checked
against the `msr sctlr_el?` and `msr actlr_el?` sweep (six EL1/EL2 SCTLR writes in the
image, all inside EL3 init and the pair of cache-management helpers near file +0x5fb80 /
+0x68950 — none inside `FUN_0xb154` → `FUN_0x380`).

| Facet | Stock normal-boot ERET to kernel | b9cfw hib-resume trampoline (per brief) |
|---|---|---|
| CPU EL when hand-off executes | EL3 (lxboot's own EL; see `FUN_0x20` prolog `cmp currentel,#0xc`) | **EL2h** (after lxboot's resume-path ERET to `hib[+0xf38]` with SPSR_EL2=0x3c9) |
| Target EL | EL2h via SPSR_EL2=0x3c9 pre-stage, ERET from EL3 | — (plain `br`, keeps EL2h) |
| SPSR used | `0x3c9` (D=A=I=F=1, AArch64, M=0b1001 EL2h) | n/a — direct branch, DAIF unchanged |
| HCR_EL2.RW | set to 1 right before ERET | **not touched** |
| SCTLR_EL1 | set once in `FUN_0x20` from constant @ file +0xd38 | **our trampoline clears {M,C}** — but we are at **EL2**, not EL1, so this is a no-op for the currently-running stage |
| SCTLR_EL2 | set once in `FUN_0x20` from constant @ file +0xd40 and never cleared at the ERET site; lxboot keeps its own EL2 mapping live right up to `eret` | **not touched** — if lxboot/snaprecipe left MMU=on at EL2, it stays on when we `br` to the kernel |
| I-cache maintenance | relies on the kernel's own `ic iallu` after it drops MMU; lxboot has `dsb;isb;ic iallu;dsb;isb` sequences in the cache helpers at file +0x5fb80 / +0x68950, called by the cold-boot pre-ERET fan-out (via `FUN_0xab0c` decompression wrapper) | **not performed** — only D-cache clean/invalidate on kernel+DTB |
| TLB invalidation | implicit via lxboot's EL2 MMU-off at reset; not re-done at hand-off | **not performed** |
| Caches (D$) | on throughout lxboot | explicitly `civac`/`cvac`'d on kernel+DTB ranges only |
| MMU | lxboot-owned EL2 translation live right up to `eret`; kernel head.S assumes MMU off and reinstates | **unchanged** — whatever lxboot/snap-resume path left is still live |
| x0 | DTB phys = `0x1000` | DTB phys (our patched blob address) |
| x1/x2/x3 | 0 / 0 / 0 | 0 / 0 / 0 |
| tzfw reloaded | yes — `FUN_0xaf3c(0)` right before `FUN_0x380` | yes — same `FUN_0xaf3c(1)` is called by the snapshot worker `FUN_0x2565c` before `FUN_0x24b08` |
| Secondary CPUs | parked in PSCI `cpu_off` (shadow-ROM holds them, DTB `enable-method=psci`, kernel brings each up via SMC) | same (we did not alter PSCI state or the hib-resume path) |
| Pre-ERET "witness" scratch | none observed in the ERET window; `0x7e8e0000`/`0xc10801c8` scratch is read by earlier stages only | n/a |
| GIC/timer init | **none in lxboot**; kernel owns it | same |

Summary of CPU-state deltas: the trampoline is doing the right thing *except* it is
touching EL1 system registers while running at EL2, and it is not quieting the EL2
MMU/caches or the I-cache before the `br`. Hand-off register-file content (`x0..x3`,
`elr`, `spsr`) matches stock for AArch64.

---

## 4. Ranked likely causes of the silent pre-UART panic

The common theme: anything that faults *before* `arch_mem_init()` prints something
through the DT-selected console is silent, and we have no pstore / ramoops, so an
instruction abort or translation fault is indistinguishable from "stuck".

### 4.1 **High — EL2 MMU still on when branching to kernel**

Linux arm64 head.S's EL2 entry path (`el2_setup`) assumes MMU off / I-cache on / D-cache
off at entry. Our trampoline runs at EL2 (per snaprecipe `FUN_0x24b08` ERET with
SPSR_EL2=0x3c9 which is EL2h, not EL1h as previously annotated — see §3) and clears
SCTLR_EL1.{M,C}, which has no effect on the active translation regime. If lxboot left
SCTLR_EL2.M=1 (very likely — lxboot itself runs cached and MMU-mapped at EL2 once the
EL3 init in `FUN_0x20` sets up the EL2 half), the kernel wakes under lxboot's EL2
translation table. The first instruction fetch at 0x30088000 will translate through
lxboot's tables, which were never populated for `0x30000000..0x31963000` → instruction
abort to the EL2 vectors lxboot set up → whatever lxboot's exception vector does (often
a `b .`), silent.

Concrete fix (patch to the trampoline, EL2 flavour):

```armasm
    mrs     x4, sctlr_el2
    mov     x5, #(1<<0 | 1<<2 | 1<<12)     // M | C | I
    bic     x4, x4, x5
    msr     sctlr_el2, x4
    isb
    tlbi    alle2
    dsb     sy
    ic      iallu
    dsb     sy
    isb
```

If verification shows we are actually at EL1 (i.e. the snaprecipe analysis was right
and I'm wrong about `M=0b1001` vs `0b0101` — confirm by reading `CurrentEL` from the
trampoline and writing the value to a magic scratch page the next cold-boot can read),
then the same thing must be done on SCTLR_EL1 instead. The trampoline should dispatch
on `CurrentEL` and do the correct one.

### 4.2 **High — I-cache not invalidated after kernel write**

`dc civac` on the kernel range makes the kernel bytes visible to the PoC for D-side
loads but does nothing for the I-side. If the I-cache held anything mapping the same
PA (unlikely on a fresh region, but the resume path's own trampoline code is adjacent),
the kernel executes stale bytes. Fix: add `ic iallu; dsb sy; isb` after the D-cache
clean, independent of §4.1.

### 4.3 **Medium — kernel booted in EL state that mismatches its build**

The LG kernel is almost certainly built for an EL2 (VHE-capable) cold boot — it is the
only path stock lxboot ever exercises. If our ERET-path really did land us at EL1h
(contrary to §3), then Linux head.S' `drop_to_el1` is skipped and `el2_setup` does not
run, and anything in `__cpu_setup` that touches EL2-only regs (e.g. `msr hcr_el2` in
some vendor patch stacks) traps with an undefined-instruction fault → silent.

Diagnostic: our hib payload can `mrs x0, CurrentEL` as the very first thing and stash
the value into a known phys address we can read back from eMMC via lxboot's own
`md`-like command on the next cold boot.

Fix if it is EL1: build a tiny stub that bounces us up to EL2 via an SMC to PSCI — but
simpler to inspect first.

### 4.4 **Medium — `/reserved-memory/kdrv_buffer{1,2}` missing `no-map`**

Stock lxboot appends `no-map` to both nodes. Without it, Linux may build a linear-map
PTE for the region described in `reg`. On stock the `reg` is `<0 0>` (empty) so the
practical mapping is a no-op, but LG's `early_init_fdt_scan_reserved_mem()` path and
the `of_reserved_mem_lookup` consumers in the kdrv driver may BUG_ON or panic if the
property set they expect is incomplete. Low likelihood of pre-dmesg panic because
reserved-memory parsing happens late, but easy to rule out.

Fix: have the patcher `fdt_appendprop(buf, off, "no-map", NULL, 0)` on both nodes
before writing out the DTB. Byte diff is 2 × (1 header + 7 bytes string + 0 bytes data)
≈ 16 bytes added to the strings block and two new property tokens.

### 4.5 **Low — DTB phys address overlap or addressability**

Stock places the DTB at phys `0x1000`. Our patcher places it wherever the b9cfw build
writes it. If our DTB sits in the 2 MiB window `[kernel_pa, kernel_pa + image_size)` =
`[0x30088000, 0x319eb000)`, the kernel's early BSS clear or the decompressor stub will
trample it and the DT-walk silently sees garbage. Even without overlap, the kernel
limits DTB phys to the first 512 MiB of the kernel's linear map (or 1 GiB on some
configs); a DTB at e.g. 2 GiB won't be reachable.

Fix / verification: place the DTB inside the first 512 MiB *below* the kernel (e.g.
`0x10000000`) or keep stock's `0x1000`, and keep it at least `image_size` away from the
kernel base.

### 4.6 **Low — `/chosen/bootargs` cell overwrite instead of extend**

`set_property_string` requires the property to already exist (`fdt_path_offset` +
`fdt_setprop_string`). The ORIG DTB has `bootargs = [00]` (1-byte placeholder), so
setting a 1200-byte string via libfdt grows the property. Our patcher does the same
and the resulting blob roundtrips through `dtc`, so this is not the current panic
cause — just note it's a thing that can go wrong if the ORIG DTB layout ever changes.

### 4.7 **Very low — tzfw not reloaded by the b9cfw path**

`FUN_0xaf3c(1)` runs in the snapshot worker before `FUN_0x24b08`, so tzfw is already
at `0x7e8e0000` when our trampoline starts. First SMC the kernel makes is PSCI
`cpu_on` for the secondary CPUs, which is well past console init — not a pre-UART
panic cause.

### 4.8 **Very low — HCR_EL2.RW not forced to 1**

Stock sets HCR_EL2.RW=1 right before ERET. If we never change HCR, the value is
whatever lxboot/snap-resume left; on the resume path this was already set during
earlier EL3 init. Kernel head.S also sets it itself in `el2_setup`, so a stale 0
value would only cause an EL1 drop to land in AArch32 if the kernel later dropped —
not a pre-console issue.

### 4.9 **Rank summary**

| Rank | Delta | Concrete action |
|---|---|---|
| 1 | EL2 MMU/caches not disabled at hand-off | Add the §4.1 SCTLR_EL2 clear + TLB/I-cache invalidate sequence to the trampoline, dispatched on `CurrentEL` |
| 2 | I-cache not invalidated after kernel copy | Add `ic iallu; dsb sy; isb` after the existing D-cache clean |
| 3 | CurrentEL may actually be EL1h, not EL2h | Instrument trampoline to write `CurrentEL` to a readable scratch; branch on it in-place |
| 4 | `no-map` missing on `kdrv_buffer{1,2}` | `fdt_appendprop(buf, off, "no-map", NULL, 0)` on both before serialisation |
| 5 | DTB phys placement | Keep DTB ≤ 0x10000000 and well clear of `[kernel_pa, kernel_pa+0x1963000)`; prefer stock's `0x1000` |
| 6 | HCR_EL2.RW | Mirror stock: `mrs/orr #1<<31/msr` to HCR_EL2 before the branch |

A single patch covering #1+#2+#6 (unconditional on EL via dispatch on `CurrentEL`) is
the smallest change most likely to get the kernel to the point it can print on
`ttyAMA0,115200n81` — at which point every later cause (#4, #5) will be visible.

---

## 5. Scope / cleanup / caveats

- All reads were on local backups; no TV contact.
- REA session on `lxboot_p4_body.bin` was opened with `format=raw-binary arch=arm64
  entry_point=0x0` and `close_binary` called when done.
- No network scans, no exploits fired, no on-TV state changed.
- Pseudocode is Ghidra's; instruction listings are Ghidra's native disassembly.
- Instruction decoding of `FUN_0x380` is byte-exact and independent of the decompiler.
- Base-address inference `0x78100000` is from a single matched pointer; other pointers
  in the same table (`0x7818f290`, `0x7818f298`, `0x7818f2b8`) also match their file
  offsets, so the base is firm.
- `_DAT_0xa1cac` memory-config selector (4 vs 6) was not resolved in this pass. B9 has
  3 GiB and the HMA layout we see in cmdline matches the 4-branch, so the 4-table above
  is the one that runs; any build-time variant where the device-tree adapter picks 6
  would also need the extra memory row.
- `FUN_0xfae4` arch-flag probe (returns 0 for AArch64 Image, 1 for AArch32 zImage) was
  not opened; its callers consistently treat 0 as AArch64 and that's enough for the
  hand-off analysis.
