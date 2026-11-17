    .equ LXBOOT_EMMC_WRITE_PUBLIC, 0x7816bcc0

    .section .text.emmc, "ax", %progbits
    .globl emmc_write
    .type  emmc_write, %function
    .balign 4
emmc_write:
    ldr     x16, =LXBOOT_EMMC_WRITE_PUBLIC
    br      x16
    .size emmc_write, .-emmc_write
