/* Link the trampoline at its load address. */
OUTPUT_FORMAT("elf64-littleaarch64")
OUTPUT_ARCH(aarch64)
ENTRY(_start)

SECTIONS
{
    . = 0x28000000;

    .text : {
        KEEP(*(.text.start))
        *(.text*)
    }

    .rodata : {
        *(.rodata*)
    }

    _end = .;
    ASSERT((_end - 0x28000000) <= 0x1000, "trampoline exceeds one 4 KiB page")

    /DISCARD/ : { *(.note.*) *(.comment) *(.eh_frame*) *(.ARM.*) *(.got*) }
}
