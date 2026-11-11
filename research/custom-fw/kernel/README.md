# kernel/

Where the Linux kernel Image, device-tree blob, and initramfs live to feed
`payload/build-kernel.sh`. Not committed — build locally.

Two paths. Pick one.

## Path A — mainline Linux + buildroot (recommended for first proof)

Produces a generic aarch64 Linux kernel + busybox initramfs. Will not drive
the panel/audio/graphics (no Realtek LG1314 drivers upstream), but will
run through early boot and print to a serial console. For our purposes the
"did we boot the kernel" proof is captured by the trampoline's witness tag
plus kernel early panics being observable in pstore/ramoops after the next
cold boot.

```bash
# One-time: get buildroot
git clone --depth 1 -b 2026.08 https://gitlab.com/buildroot.org/buildroot ~/repos/vendor/buildroot

cd ~/repos/vendor/buildroot

# Start from the aarch64 generic defconfig
make qemu_aarch64_virt_defconfig
make menuconfig
#   Toolchain -> external toolchain "aarch64-linux-gnu"
#   Kernel    -> y, config "use a custom defconfig"
#               defconfig fragment file =
#                 ~/repos/lg-webos-tv/b9-custom-fw/kernel/kernel.config.frag
#               kernel image target: Image
#   Filesystem images -> cpio the root filesystem (initramfs)  [y]
#                        Compression method: lz4
#   System configuration -> Init system: BusyBox
#                           Getty options: ttyAMA0, 115200

make -j"$(nproc)"

# Outputs land in output/images/
cp output/images/Image            ~/repos/lg-webos-tv/b9-custom-fw/kernel/Image
cp output/images/rootfs.cpio.lz4  ~/repos/lg-webos-tv/b9-custom-fw/kernel/initramfs.cpio.lz4
# DTB is next-section
```

## DTB (either path)

The B9's device tree isn't upstream. For first-boot proof, use the
minimal generic "virt" DTB from buildroot — it won't match the real
hardware but Linux will at least start parsing and reach early init.

```bash
cp ~/repos/vendor/buildroot/output/images/*.dtb \
   ~/repos/lg-webos-tv/b9-custom-fw/kernel/lg1314.dtb
```

Phase 2 replaces this with an extracted or hand-written LG1314 DTB.

## Path B — later phase

Once we have a kernel built with the actual Realtek LG1314 drivers (either
from a vendor source drop, an existing community port, or by writing our
own), drop its `Image` + DTB + initramfs into this directory in the same
shape as Path A. Phase 2+ work.

## Filesystem contents (initramfs)

Buildroot's default busybox initramfs is enough for the proof. Phase 3
swaps in a richer rootfs mounted from a persistent partition and running
dropbear from HBC.

## kernel.config.frag

Sits here (next to this README) so buildroot can pick it up by path.
Minimal — just enables LZ4 initramfs, pstore (for the witness), and
`ARCH=arm64`.
