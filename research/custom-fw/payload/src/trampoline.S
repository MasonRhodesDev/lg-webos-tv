    .equ KERNEL_ENTRY,   0x30088000
    .equ KERNEL_BASE,    0x30000000
    .equ KERNEL_END,     0x32000000
    .equ DTB_ADDR,       0x32000000
    .equ DTB_END,        0x32100000

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
    ldr     x0, =DTB_ADDR
    mov     x1, xzr
    mov     x2, xzr
    mov     x3, xzr

    ldr     x8,  =KERNEL_BASE
    ldr     x9,  =KERNEL_END
1:  dc      civac, x8
    add     x8, x8, #64
    cmp     x8, x9
    b.lo    1b

    ldr     x8,  =DTB_ADDR
    ldr     x9,  =DTB_END
2:  dc      civac, x8
    add     x8, x8, #64
    cmp     x8, x9
    b.lo    2b

    dsb     sy
    isb

    mrs     x5, CurrentEL
    lsr     x5, x5, #2
    cmp     x5, #2
    b.eq    el2_path

    mrs     x10, sctlr_el1
    bic     x10, x10, #(1 << 0)
    bic     x10, x10, #(1 << 2)
    bic     x10, x10, #(1 << 12)
    msr     sctlr_el1, x10
    isb
    tlbi    vmalle1
    dsb     sy
    ic      iallu
    dsb     sy
    isb
    b       jump_kernel

el2_path:
    mrs     x10, hcr_el2
    orr     x10, x10, #(1 << 31)
    msr     hcr_el2, x10

    mrs     x10, sctlr_el2
    bic     x10, x10, #(1 << 0)
    bic     x10, x10, #(1 << 2)
    bic     x10, x10, #(1 << 12)
    msr     sctlr_el2, x10
    isb

    tlbi    alle2
    dsb     sy
    ic      iallu
    dsb     sy
    isb

jump_kernel:
    ldr     x11, =KERNEL_ENTRY
    br      x11

3:  wfi
    b       3b
    .size   _start, .-_start
