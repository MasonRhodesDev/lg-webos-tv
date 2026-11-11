// trampoline.S — bridges lxboot's hib-resume ERET to the Linux aarch64
// kernel entry ABI.
//
// Entry state (confirmed by RE of lxboot's hib-resume): EL2h AArch64,
// DAIF masked. MMU and caches are ON with lxboot's EL2 translation
// tables, which do NOT map our kernel's entry PC. We must disable both
// MMU and caches at EL2 and invalidate TLBs + I-cache before branching
// to the kernel, otherwise instruction fetch at the kernel entry PC
// faults silently.
//
// Linux arm64 entry contract: x0 = DTB phys, x1=x2=x3 = 0, MMU off,
// D-cache off, I-cache may be on (we invalidate it to be safe). Kernel
// prefers to be entered at EL2 for KVM/hypervisor support — we stay at
// EL2 and set HCR_EL2.RW=1 so the kernel's EL1-hosted parts run
// AArch64.
//
// Layout (set by payload/build-kernel.sh):
//   0x28000000  trampoline       (this blob)
//   0x30088000  Linux kernel Image (aligned_base 0x30000000 + text_offset 0x88000)
//   0x32000000  DTB

    .equ KERNEL_ENTRY,   0x30088000
    .equ KERNEL_BASE,    0x30000000       /* range start for D-cache clean */
    .equ KERNEL_END,     0x32000000
    .equ DTB_ADDR,       0x32000000
    .equ DTB_END,        0x32100000

    .section .text.start, "ax", %progbits
    .globl _start
    .type  _start, %function
_start:
    // Preserve Linux entry regs early (even though they're constants) so
    // nothing clobbers them during cache maintenance.
    ldr     x0, =DTB_ADDR
    mov     x1, xzr
    mov     x2, xzr
    mov     x3, xzr

    // Clean+invalidate D-cache for kernel + DTB ranges while the MMU is
    // still on, so lxboot's writes become coherent before we turn the
    // dcache off. 64-byte lines on this SoC.
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

    // Dispatch on CurrentEL. lxboot's hib-resume delivers us at EL2h
    // but keep the EL1 path defensively.
    mrs     x5, CurrentEL
    lsr     x5, x5, #2
    cmp     x5, #2
    b.eq    el2_path

    // ---- EL1 path ----
    mrs     x10, sctlr_el1
    bic     x10, x10, #(1 << 0)         // M
    bic     x10, x10, #(1 << 2)         // C
    bic     x10, x10, #(1 << 12)        // I
    msr     sctlr_el1, x10
    isb
    tlbi    vmalle1
    dsb     sy
    ic      iallu
    dsb     sy
    isb
    b       jump_kernel

el2_path:
    // Set HCR_EL2.RW=1 so EL1 runs AArch64 (should already be set, but
    // make it explicit).
    mrs     x10, hcr_el2
    orr     x10, x10, #(1 << 31)
    msr     hcr_el2, x10

    // Disable MMU, D-cache, I-cache at EL2.
    mrs     x10, sctlr_el2
    bic     x10, x10, #(1 << 0)         // M
    bic     x10, x10, #(1 << 2)         // C
    bic     x10, x10, #(1 << 12)        // I
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

    // Unreachable
3:  wfi
    b       3b
    .size   _start, .-_start
