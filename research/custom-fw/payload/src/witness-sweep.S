// witness-sweep.S — a single-block payload that writes a distinct 16-byte
// tag at several candidate DRAM addresses, flushes, and SYSTEM_RESETs.
//
// Entry convention from the hib-resume path: EL1h AArch64, DAIF masked,
// PC = header.entryPC = 0x30000000.
//
// Each witness tag is a short ASCII magic followed by 8 bytes identifying
// which site wrote it — so after a cold boot, reading /dev/mem at any of
// these addresses tells us:
//   a) whether our code wrote there
//   b) which site (so we can tell survival from re-writes)
//
// Sites (all inside [0x00000000, 0x3e3fffff] System RAM, outside HMA):
//   0x02000000 : "CFW_W0_02000000_"    - just above stock kernel data
//   0x05000000 : "CFW_W1_05000000_"    - further above
//   0x10000000 : "CFW_W2_10000000_"    - middle of block
//   0x20000000 : "CFW_W3_20000000_"    - upper half
//   0x3e000000 : "CFW_W4_3E000000_"    - just below the gap

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
    // Helper macro-equivalent: store tag at (addr), flush line.
    // x1 = tag source pointer, x2 = destination address.

    adr     x1, tag_w0
    ldr     x2, =0x02000000
    ldp     x3, x4, [x1]
    stp     x3, x4, [x2]
    dc      civac, x2

    adr     x1, tag_w1
    ldr     x2, =0x05000000
    ldp     x3, x4, [x1]
    stp     x3, x4, [x2]
    dc      civac, x2

    adr     x1, tag_w2
    ldr     x2, =0x10000000
    ldp     x3, x4, [x1]
    stp     x3, x4, [x2]
    dc      civac, x2

    adr     x1, tag_w3
    ldr     x2, =0x20000000
    ldp     x3, x4, [x1]
    stp     x3, x4, [x2]
    dc      civac, x2

    adr     x1, tag_w4
    ldr     x2, =0x3e000000
    ldp     x3, x4, [x1]
    stp     x3, x4, [x2]
    dc      civac, x2

    dsb     sy
    isb

    // PSCI SYSTEM_RESET: SMC #0 with x0 = 0x84000009
    movz    x0, #0x0009
    movk    x0, #0x8400, lsl #16
    smc     #0

    // Unreachable: park and wait for the hardware watchdog.
1:  wfi
    b       1b

    .size   _start, .-_start

    .section .rodata.tags, "a", %progbits
    .balign 16
tag_w0: .ascii "CFW_W0_02000000_"
tag_w1: .ascii "CFW_W1_05000000_"
tag_w2: .ascii "CFW_W2_10000000_"
tag_w3: .ascii "CFW_W3_20000000_"
tag_w4: .ascii "CFW_W4_3E000000_"
