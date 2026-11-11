// witness-emmc.S — hib-resume payload that writes a 16-byte magic to
// sector 0 of the 'logo' eMMC partition (mmcblk0p25), then hangs.
//
// Observability contract
// ----------------------
// After a cold boot following a trampoline run:
//   dd if=/dev/mmcblk0p25 bs=16 count=1 | xxd
// expects:
//   00000000: 4239 4346 575f 5749 544e 4553 5330 3031  B9CFW_WITNESS001
// If present: our trampoline executed, reached witness_emmc_main, and
// lxboot's emmc_write returned success. The TV may be sitting at splash
// forever (expected — we hang after the write) OR a watchdog reboot
// hid the hang.
// If absent: either the trampoline never ran, or emmc_write returned
// an error (we can't signal that from here — see Risks).
//
// Entry state (inherited from lxboot's hib-resume ERET via trampoline.S)
// ----------------------------------------------------------------------
//   EL2h AArch64, DAIF masked.
//   MMU + I-cache + D-cache ON (lxboot's EL2 translation tables).
//   SP = lxboot's resume stack (valid; we re-anchor to our page to be
//        independent of its remaining capacity).
//   lxboot image resident at 0x78100000; .data/.bss at 0x781ee000+ with
//   emmc driver state intact (controller was last used by lxboot itself
//   to load kernel from mmcblk0p21/p22, so it is live).
//   Our payload decompressed into 0x30000000..0x30000fff (one 4 KiB hib
//   comp block). Linker must place this .text at 0x30000000.
//
// Target partition
// ----------------
//   From /proc/partinfo:
//     part25: 06500000 00080000 "logo"  (512 KiB, unsigned — CRC32+magic only)
//   Byte offset on whole-eMMC LBA space = 0x06500000.
//   Sector offset = 0x06500000 / 512 = 206848 (0x32800), matches
//   mmcblk0p25 sector 0 when read via the normal block layer.
//
//   Alternative: part49 "dump" at 0x93080000 (10 MiB, crash-dump only).
//   Safer, but logo is already recoverable from EPK re-flash and the
//   stock boot path regenerates the panel logo from userspace at
//   boot, so a trashed sector 0 of p25 is cosmetically visible (no
//   splash logo until re-flashed) rather than silently discarded.
//   We use p25 so the witness is observable even if /proc/mmcblk* is
//   not reachable (dd on the raw partition always works).
//
// Build: assemble, link against payload.ld with emmc_write.S, drop into
// the hib snapshot as compType=3 (LZ4) block at entryPC = 0x30000000.

    .equ PART25_LOGO_OFFSET, 0x06500000
    .equ PART49_DUMP_OFFSET, 0x93080000
    .equ WITNESS_OFFSET,     PART25_LOGO_OFFSET
    .equ WITNESS_SIZE,       512

    // Private stack top inside our own decompressed 4 KiB page. Keep
    // it below the witness buffer and 16-byte aligned so the AAPCS
    // "SP 16-byte aligned at public entries" rule is satisfied.
    .equ WITNESS_SP,         0x30000f00

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
    // Re-anchor SP into our own page. lxboot's SP may point into a
    // region the kernel is about to clobber; we need 16+ bytes for
    // the lxboot thunk's stp x29,x30.
    ldr     x9, =WITNESS_SP
    mov     sp, x9

    // Make the witness buffer DMA-coherent. lxboot's emmc write path
    // issues real DMA out of this address (vtable +0x20 in the
    // controller struct). Our stp of literals into .rodata-inline was
    // already in D-cache; flush the whole 512 B so DMA sees the magic.
    adr     x2, witness_buf
    mov     x4, x2
    add     x5, x2, #WITNESS_SIZE
1:  dc      civac, x4
    add     x4, x4, #64              // 64 B dcache line on this SoC
    cmp     x4, x5
    b.lo    1b
    dsb     sy
    isb

    // Prepare the lxboot emmc_write call:
    //   x0 = byte offset on whole-eMMC (sector 0 of mmcblk0p25)
    //   w1 = size in bytes (one sector)
    //   x2 = source buffer VA (= PA under lxboot's identity map)
    movz    x0, #(WITNESS_OFFSET & 0xffff)
    movk    x0, #(WITNESS_OFFSET >> 16), lsl #16
    mov     w1, #WITNESS_SIZE
    // x2 already holds witness_buf from the flush loop.

    // Set LR so emmc_write's ret lands in our hang.
    adr     x30, hang

    // Thin wrapper does `br` into lxboot's public emmc_write. On
    // success x0 = 512; on failure x0 = 0xffffffff. We don't inspect
    // because we have no UART path at this point in the trampoline
    // staging — the observable is the sector contents post-reboot.
    b       emmc_write

hang:
    // Intentionally spin forever. The TV should sit at splash (or
    // whatever lxboot left on-screen) until the watchdog bites.
    // This is the second observable: "did the TV come up normally?"
    // No => trampoline probably ran; Yes => watchdog masked our hang
    // or lxboot continued past us (unexpected).
    dsb     sy
    isb
2:  wfi
    b       2b
    .size   _start, .-_start

    .section .rodata.witness, "a", %progbits
    .balign 64
    .globl witness_buf
witness_buf:
    .ascii  "B9CFW_WITNESS001"       // 16 bytes magic
    .fill   (WITNESS_SIZE - 16), 1, 0 // zero-pad to 512 bytes
    .size   witness_buf, .-witness_buf
