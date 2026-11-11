// Proof-of-life payload for B9 hib snapshot-resume compType=3 (LZ4) path.
//
// Entry conditions (per FUN_00024b08 analysis):
//   EL1h AArch64, DAIF masked (SPSR_EL2 = 0x3c9).
//   PC = entryPC (header +0xf38) = 0x30000000.
//   SP_EL1 = lxboot's stack (inherited; do not depend on it).
//   MMU state at EL1 is undefined; treat memory as un-translated for our accesses.
//   tzfw is loaded at EL3 immediately before ERET; SMC #0 routes there.
//   No x0 argument convention, no DTB.
//
// Destination/witness live in normal System RAM window [0x20000000, 0x3e300000)
// taken from the live /proc/iomem probe. Payload page is written to phys
// 0x30000000; witness page lives at phys 0x30100000 (1 MiB apart, non-overlapping).
//
// Strategy:
//   1. Write "GRYHATB9CTRL0002" + 16 bytes of zero at phys 0x30100000.
//      Flush by VA so the write is visible after a warm reset that keeps DRAM.
//   2. PSCI SYSTEM_RESET via SMC #0 (0x84000009) — PSCI method is "smc" per DT.
//   3. WFI loop fallback if SMC somehow returns.
//
// The owner reads the witness page back later with:
//     ssh root@<tv-address> 'dd if=/dev/mem bs=1 count=32 skip=$((0x30100000)) 2>/dev/null | xxd'
// expecting "GRYHATB9CTRL0002" at offset 0.

    .section .text.start, "ax", %progbits
    .globl  _start
    .type   _start, %function
_start:
    // x2 = witness physical address (0x30100000)
    movz    x2, #0x0000
    movk    x2, #0x3010, lsl #16

    // Load 16-byte signature from the embedded literal
    adr     x1, sig
    ldp     x3, x4, [x1]

    // Store signature + trailing zero pair to the witness page
    stp     x3, x4, [x2]
    stp     xzr, xzr, [x2, #16]

    // Make the write visible beyond any inner D-cache
    dc      civac, x2
    dsb     sy
    isb

    // PSCI SYSTEM_RESET = 0x84000009; EL1 SMC should trap to EL3 tzfw
    movz    x0, #0x0009
    movk    x0, #0x8400, lsl #16
    smc     #0

    // SMC returned (shouldn't happen on a correct PSCI impl). Park and wait
    // for the external watchdog to reset us.
1:  wfi
    b       1b

    .size   _start, .-_start

    .section .rodata.sig, "a", %progbits
    .balign 16
sig:
    .ascii  "GRYHATB9CTRL0002"      // exactly 16 bytes
