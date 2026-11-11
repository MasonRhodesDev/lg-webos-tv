/* Link the proof-of-life payload at the resume entry physical address.
 * The hib compType=3 (LZ4) path will decompress our single block into
 * (start_pfn << 12) = 0x30000000, and lxboot ERETs with ELR_EL2 = 0x30000000.
 */
OUTPUT_FORMAT("elf64-littleaarch64")
OUTPUT_ARCH(aarch64)
ENTRY(_start)

SECTIONS
{
    . = 0x30000000;

    .text : {
        KEEP(*(.text.start))
        *(.text*)
    }

    .rodata : {
        *(.rodata*)
    }

    /* One 4 KiB page per decompressed comp block. */
    _end = .;
    ASSERT((_end - 0x30000000) <= 0x1000, "payload exceeds one 4 KiB page")

    /DISCARD/ : { *(.note.*) *(.comment) *(.eh_frame*) *(.ARM.*) }
}
