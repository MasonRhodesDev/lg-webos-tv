// emmc_write.S — bare-metal eMMC single-sector write primitive for B9 trampoline.
//
// Strategy: THIN WRAPPER around lxboot's own production emmc_write API.
// Re-implementing an SDHCI-variant poke sequence from scratch for a
// Realtek/LGE "lge,lg1k-sdhci-5.0-v3" controller (with its vendor clock
// gating, pin mux, Realtek DMA mode select, and partition-switch state)
// is high-risk, large, and the whole payload has to fit in one 4 KiB
// decompressed hib block. Calling the existing function:
//
//   * costs ~0x10 bytes of code
//   * reuses lxboot's live, fully-initialized controller context
//     (block size at DAT_781ee0cc, scratch bounce buffer at DAT_781ee0d8,
//     controller vtable at DAT_781ee0e0 — all populated at lxboot boot)
//   * gets CMD24/CMD25 + CMD13 polling + CMD12 abort on error for free
//
// Entry state inherited from the trampoline (and ultimately from lxboot's
// hib-resume ERET): EL2h AArch64, DAIF masked, MMU + D-cache + I-cache ON
// using lxboot's EL2 translation tables. lxboot identity-maps at least
// [0x30000000, 0x40000000) (our payload) AND [0x78000000, 0x78200000)
// (its own .text/.data), so a direct BL into 0x7816bcc0 from our payload
// works with no MMU change.
//
// We deliberately do NOT disable the MMU before calling: the target
// function dereferences .data pointers (DAT_781ee0e0 etc.) that are only
// addressable via the live translation.
//
// lxboot symbol resolved by static RE of b9-raw/a1-lxboot/lxboot_p4.img:
//
//   0x7816bcc0  emmc_write(uint64_t byte_offset, uint32_t size,
//                          void *buf)
//       -> returns bytes written (0xffffffff on failure)
//
//     Disassembly (from REA):
//       stp  x29, x30, [sp, #-0x10]!
//       mov  x29, sp
//       mov  w3, #0              ; flags = 0 (silent)
//       bl   0x7816ba54          ; real body: emmc_write_core
//       ldp  x29, x30, [sp], #0x10
//       ret
//
//   0x7816ba54  emmc_write_core(uint64_t byte_offset, uint32_t size,
//                               void *buf, uint64_t flags)
//     - Checks "inited" via 0x7816b458 (returns <0 if not).
//     - Aligns byte_offset to DAT_781ee0cc (block size = 512 on B9).
//     - If head-misaligned: read-modify-write via DAT_781ee0d8 bounce.
//     - Else chunks through vtable:
//         (*DAT_781ee0e0+0x18)(off,len,bounce)   -> block read
//         (*DAT_781ee0e0+0x20)(off,len,buf)      -> block write (CMD24/25)
//     - Returns bytes written on success, 0xffffffff on any failure.
//
// ABI of this file's `emmc_write`:
//   x0  in : eMMC byte offset (must be 512-aligned for one-sector write)
//   w1  in : byte count (must be 512 for the single-sector primitive)
//   x2  in : pointer to source buffer (MMU-mapped, cache-maintained by
//            caller before invocation)
//   x30 in : return address (we tail-branch, so this is preserved)
//   x0  out: bytes written (512 on success, 0xffffffff on error)
//
// Clobbers: x16 (IP0), lxboot's own callee-saves are its problem.
// Needs:    16 bytes of valid stack (the thunk pushes x29/x30).

    .equ LXBOOT_EMMC_WRITE_PUBLIC, 0x7816bcc0

    .section .text.emmc, "ax", %progbits
    .globl emmc_write
    .type  emmc_write, %function
    .balign 4
emmc_write:
    // Pure tail-branch to lxboot's public emmc_write. x0, w1, x2 pass
    // straight through; the thunk hardcodes flags=0 in w3. Our x30
    // becomes the thunk's return address, so when it returns we return
    // to our caller.
    ldr     x16, =LXBOOT_EMMC_WRITE_PUBLIC
    br      x16
    .size emmc_write, .-emmc_write
