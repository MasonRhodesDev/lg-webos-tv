    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
1:  wfe
    b       1b
    .size   _start, .-_start
