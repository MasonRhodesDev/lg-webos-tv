# Buildroot-side Linux kernel config fragment.
# Target: aarch64, minimal boot-to-shell, LZ4 initramfs, pstore for witness.

CONFIG_64BIT=y
CONFIG_ARM64=y

# Early console on the UART we expect (matches stock cmdline: ttyAMA0)
CONFIG_EARLYCON=y
CONFIG_SERIAL_AMBA_PL011=y
CONFIG_SERIAL_AMBA_PL011_CONSOLE=y

# Initramfs + LZ4 decompression
CONFIG_BLK_DEV_INITRD=y
CONFIG_RD_LZ4=y
CONFIG_DECOMPRESS_LZ4=y
CONFIG_INITRAMFS_COMPRESSION_LZ4=y

# Pstore: our witness survives a soft reboot via ramoops
CONFIG_PSTORE=y
CONFIG_PSTORE_RAM=y
CONFIG_PSTORE_CONSOLE=y
CONFIG_PSTORE_PMSG=y

# Keep everything else minimal: no modules, no network stack by default
CONFIG_MODULES=n
CONFIG_NET=n
CONFIG_SMP=n

# BusyBox init path
CONFIG_DEVTMPFS=y
CONFIG_DEVTMPFS_MOUNT=y
