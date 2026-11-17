    .section .text.start, "ax", %progbits
    .globl  _start
    .type   _start, %function
_start:
    movz    x2, #0x0000
    movk    x2, #0x3010, lsl #16

    adr     x1, sig
    ldp     x3, x4, [x1]

    stp     x3, x4, [x2]
    stp     xzr, xzr, [x2, #16]

    dc      civac, x2
    dsb     sy
    isb

    movz    x0, #0x0009
    movk    x0, #0x8400, lsl #16
    smc     #0

1:  wfi
    b       1b

    .size   _start, .-_start

    .section .rodata.sig, "a", %progbits
    .balign 16
sig:
    .ascii  "GRYHATB9CTRL0002"
