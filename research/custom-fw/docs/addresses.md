# Memory map and address choices

## DRAM (from `/proc/iomem` on the live B9)

| Range | Role |
|-------|------|
| `0x00000000 – 0x3e3fffff` | System RAM |
| `0x3e400000 – 0x62ffffff` | **unmapped** (nothing there) |
| `0x63000000 – 0x7e7fffff` | System RAM — HMA, graphics-reserved |
| `0xaf000000 – 0xbfffffff` | System RAM — HMA, graphics-reserved |

Stock kernel code:  `0x00088000 – 0x014e1fff`
Stock kernel data:  `0x0155c000 – 0x019eafff`

## Safe window for payload work

`[0x02000000, 0x3e3fffff]` — above stock kernel image, in normal System RAM
that stock kernel only touches after its own init once we've handed off.

## Phase 0 choices (current)

- Entry PC (ELR_EL2 on ERET): `0x30000000`
- Witness: `0x30100000` (**clobbered by HMA re-init on warm reset**; replace
  with pstore-reserved region for a direct read-back in phase 1)

## Phase 1 proposed layout

Everything decompressed before trampoline runs; addresses are PFNs in the
comp meta table (`addr >> 12`).

| Blob | Phys addr | Size |
|------|-----------|------|
| Trampoline | `0x30000000` | ≤ 4 KiB |
| Linux kernel (Image, uncompressed) | `0x30200000` | ~16 MiB |
| DTB | `0x31800000` | ~64 KiB |
| initramfs (cpio.lz4) | `0x31a00000` | ≤ 4 MiB |
| Witness (ramoops / dedicated pstore region) | `0x3e000000` | 4 KiB |

Rationale for 2 MiB alignment on the kernel: ARMv8 Image header prefers
`0x80000` or larger alignment.

## Entry ABI expected by Linux aarch64 Image

Per `Documentation/arm64/booting.txt`:

- x0 = physical address of DTB
- x1 = x2 = x3 = 0
- MMU off, D-cache off, I-cache "doesn't matter"
- CPU at EL1 or EL2 (EL1 is fine)
- DAIF: I, A, F masked (SError can be on). Stock: `0x3c9` matches.

## Entry ABI delivered by lxboot

- EL1h AArch64
- SPSR_EL2 = `0x3c9` → DAIF (D,A,I,F) all masked
- ELR_EL2 = `header.entryPC`
- No x0, no DTB pointer
- Tzfw reloaded at EL3 immediately before ERET; SMC #0 routes there
  (PSCI confirmed from device-tree `/proc/device-tree/psci/method = smc`)

## Trampoline (phase 1 role)

```
_start:
    ldr x0, =0x31800000      // DTB phys
    mov x1, #0
    mov x2, #0
    mov x3, #0

    // Clean+invalidate kernel + DTB + initramfs ranges (loop),
    // dsb sy ; isb

    mrs x4, sctlr_el1
    bic x4, x4, #(1 << 0)    // M (MMU) = 0
    bic x4, x4, #(1 << 2)    // C (D-cache) = 0
    msr sctlr_el1, x4
    isb

    ldr x5, =0x30200000      // kernel entry
    br  x5
```
