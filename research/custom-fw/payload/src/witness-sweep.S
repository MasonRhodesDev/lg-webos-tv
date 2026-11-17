    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:

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

    movz    x0, #0x0009
    movk    x0, #0x8400, lsl #16
    smc     #0

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
