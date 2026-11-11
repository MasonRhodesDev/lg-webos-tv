// hang.S — park forever at entry point. If the hib chain reaches us on
// cold boot, the TV stops here (no stock boot proceeds). Observable
// externally as "TV never shows the webOS home screen; pull AC to recover."
//
// Entry state (from lxboot hib-resume): EL1h AArch64, DAIF masked.

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
1:  wfe
    b       1b
    .size   _start, .-_start
