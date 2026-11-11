# b9-custom-fw

Custom firmware installer for an LG B9 OLED television that the owner has
rooted and wants to run their own software on. The firmware is delivered
as a Linux "hibernation image" so the second-stage bootloader can load it
at cold boot. This project builds the firmware image, flashes it over
SSH, and manages per-boot re-arming.

## Layout

```
installer/
  install.sh          dd our hib image to the hib partition + set two
                      "resume pending" bytes in the env partition
  uninstall.sh        restore both partitions from backups/
  persist-init.sh     Homebrew Channel init.d hook that reasserts the
                      two "resume pending" bytes at every boot
payload/
  src/                aarch64 source: a small asm shim (main.S) and a
                      Linux-entry-ABI trampoline (trampoline.S)
  build.sh            build + pack phase-0 shim into payload/build/hib.img
  build-kernel.sh     build + pack trampoline + Linux kernel + DTB +
                      initramfs into payload/build/hib.img
kernel/               where you drop Image/dtb/initramfs; buildroot
                      recipe in kernel/README.md
tools/
  hib-pack            single-block hib image builder
  hib-pack-multi      multi-block hib image builder
  hib-unpack          print the header + meta table of any hib image
  tv-probe            read TV state over SSH
backups/              committed pre-install p11 (env) + p48 (hib) dumps
docs/                 address map, per-phase status
```

## Target

- Model: LG OLED55B9PUA, webOS 4.10.0, fw 05.40.45
- SoC: Realtek LG1314 (M19 board), aarch64
- Rooted via Homebrew Channel (HBC); dropbear SSH as root is the install
  channel
- Target IP configured per-install via `$TV_HOST`, not hardcoded

## How the install works

The second-stage bootloader on this TV supports Linux hibernation resume:
it can load a saved kernel image from a dedicated flash partition and
jump to it at cold boot, driven by two one-byte flags in the environment
partition. We ship a hib image that contains our own code instead of a
saved stock kernel. The installer:

1. backs up the env (`mmcblk0p11`) and hib (`mmcblk0p48`) partitions
2. writes our hib image to `mmcblk0p48`
3. flips the two "resume pending" bytes in `mmcblk0p11`
4. `sync`

On next cold boot the bootloader reads our hib image, decompresses the
blocks to their declared destination addresses, and transfers control to
the trampoline, which hands off to our Linux kernel following the
aarch64 kernel entry ABI.

Recovery: `uninstall.sh` restores both partitions from `backups/`. The
bootloader also has a built-in fall-through to the normal signed-kernel
boot if the hib image is malformed.

## Phases

- **Phase 0 (done).** 80-byte aarch64 proof-of-life payload. Writes a
  known byte sequence to DRAM, then `SYSTEM_RESET` via PSCI. Chain
  verified end-to-end.
- **Phase 1 (in progress).** Trampoline + real Linux kernel + DTB +
  initramfs via `payload/build-kernel.sh`. Needs kernel binaries from
  `kernel/` (buildroot recipe in `kernel/README.md`).
- **Phase 2.** HBC init.d hook (`persist-init.sh`) reasserts the resume
  flags and rewrites the hib image every boot. Without it, LG's own
  periodic snapshot regeneration eventually overwrites our hib image.
- **Phase 3.** Replace the initramfs with a usable rootfs: busybox +
  dropbear, mount `mmcblk0p52` (data) as persistent `/root`. Stock LG
  partitions stay intact so `uninstall.sh` reverts cleanly.

## Addresses (phase 0; revise for phase 1)

- Entry PC: `0x30000000` (bootloader ERETs here)
- Witness: `0x02000000` (System RAM above the stock kernel image, outside
  the HMA graphics-reserved ranges)

Full map in `docs/addresses.md`.

## Not committed

Backup partition dumps in `backups/` are per-TV (contain serial, MAC,
widevine/DRM keys in adjacent partitions). Keep this repo private. The
`.gitignore` excludes `payload/build/` and all `*.bin` outside `backups/`
so a stranger cloning gets the scaffold and source, not any live state.
