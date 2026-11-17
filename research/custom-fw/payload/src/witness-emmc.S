    .equ PART25_LOGO_OFFSET, 0x06500000
    .equ PART49_DUMP_OFFSET, 0x93080000
    .equ WITNESS_OFFSET,     PART25_LOGO_OFFSET
    .equ WITNESS_SIZE,       512

    .equ WITNESS_SP,         0x30000f00

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
    ldr     x9, =WITNESS_SP
    mov     sp, x9

    adr     x2, witness_buf
    mov     x4, x2
    add     x5, x2, #WITNESS_SIZE
1:  dc      civac, x4
    add     x4, x4, #64
    cmp     x4, x5
    b.lo    1b
    dsb     sy
    isb

    movz    x0, #(WITNESS_OFFSET & 0xffff)
    movk    x0, #(WITNESS_OFFSET >> 16), lsl #16
    mov     w1, #WITNESS_SIZE

    adr     x30, hang

    b       emmc_write

hang:
    dsb     sy
    isb
2:  wfi
    b       2b
    .size   _start, .-_start

    .section .rodata.witness, "a", %progbits
    .balign 64
    .globl witness_buf
witness_buf:
    .ascii  "B9CFW_WITNESS001"
    .fill   (WITNESS_SIZE - 16), 1, 0
    .size   witness_buf, .-witness_buf
