# Path C: kexec — full custom OS after stock boot

Load and execute a custom kernel from the running stock system, replacing the LG kernel at runtime. After `kexec -e` the TV runs whatever kernel you staged, on LG display hardware, with nothing written to eMMC. The stock boot still runs first: lxboot verifies everything, the LG kernel and upstart start, and at ~35 s the HBC init.d hook fires `kexec`.

Everything below marked **confirmed** was read off the B9 over SSH on 2026-10-26. The survey was read-only: nothing was staged (`/sys/kernel/kexec_loaded` is `0`), no process was stopped, no file on the TV was changed. Mechanisms taken from other models or from community projects are marked as such.

## How kexec works here

```
Stock boot chain (0–35 s):
  secureboot → lxboot (verifies kernel + 8 partitions) → LG kernel 4.4.84 → upstart → HBC init.d

Kexec transition (~35 s+):
  HBC init.d script:
    1. kexec -l <Image> [--initrd=<cpio>] --append="<cmdline>" [--dtb=<dtb>] --mem-max=0x3e3fffff
    2. sync; kexec -e
    3. kernel_kexec → machine_shutdown (CPUs 1–3 go down via PSCI cpu_off)
       → machine_kexec → jump to the new Image at text_offset

Custom OS:
    custom kernel → custom init (initramfs, or root= on eMMC/USB) → own display stack
```

The new kernel inherits the hardware state the stock kernel left: the display engines keep scanning out the last stock frame until something reprograms them, in-flight DMA is whatever LG's drivers left running, and the GIC is re-initialised by the new kernel.

## What the TV already has (confirmed)

### Kernel

`Linux 4.4.84-169.gld4tv.5 #1 SMP PREEMPT Wed Jul 3 16:55:54 KST 2024 aarch64`, built with gcc 6.4.0. From `/proc/config.gz`:

| Option | Value | Why it matters |
|---|---|---|
| `CONFIG_KEXEC`, `CONFIG_KEXEC_CORE` | `y` | kexec is compiled in. Upstream arm64 only gained kexec in 4.8, so this is LG's backport, paired with LG's own kexec-tools build (below). |
| `kernel.kexec_load_disabled` | `0` | the `kexec_load` syscall is allowed |
| `sys_kexec_file_load` | weak symbol (not implemented) | use `kexec -l`, never `-s`; there is no signature check on this path |
| `CONFIG_HOTPLUG_CPU` | `y` | secondary CPUs can be offlined for the transition (PSCI `cpu_off`; `cpu_psci_cpu_die` present). No `cpus_are_stuck_in_kernel()` gate in this kernel — the `fix_stuck_cpus.ko` workaround LG-TV-OSS needs on O22/5.4 does not apply here. |
| `CONFIG_COMPAT` | `y` | the whole webOS userspace is 32-bit ARM (`/bin/busybox` is ELF32/ARM); `compat_sys_kexec_load` exists |
| `CONFIG_DEVMEM`, `CONFIG_DEVKMEM` | `y`, no `STRICT_DEVMEM` | `/dev/mem` is unrestricted — usable for register probing and for a userspace watchdog feeder |
| `CONFIG_MODVERSIONS`, `CONFIG_MODULE_SIG` | not set | modules are gated only by vermagic |
| `CONFIG_MODULE_IGNORE_SUBVER` | `y` (LG option, `CONFIG_WEBOS=y`) | vermagic compares only `4.4` plus the flag tail `SMP preempt mod_unload aarch64`. This is why stock `mali_kbase.ko` (vermagic `4.4.84`) loads on `4.4.84-169.gld4tv.5`. Any 4.4.x LG tree builds modules the stock kernel accepts — struct mismatches then fail at runtime, not at `insmod`. |
| `CONFIG_BLK_DEV_INITRD` | **not set** | the stock kernel (and LG's kdump kernel) cannot take an initramfs. A custom kernel must enable it; experiments with LG's images need `root=` on eMMC or USB. |
| `CONFIG_HIBERNATION` | `y` | the stock cmdline carries `snapshot resume=/dev/mmcblk0p48` (Quick Start+). Drop it from any kexec cmdline or the kexec'd LG kernel will try to resume the snapshot. |
| `CONFIG_ARCH_LG1K`, `CONFIG_LG1K_*`, `CONFIG_ION_LG1K` | `y` | the platform is LG's LG1K family (see naming below) |
| `CONFIG_ARM_SP805_WATCHDOG`, `CONFIG_WDT_DETECT_LG1K`, `CONFIG_WDT_LOG` | `y` | see [Watchdogs](#watchdogs-critical) |
| `CONFIG_SERIAL_AMBA_PL011(_CONSOLE)` | `y` | console is `ttyAMA0` (PL011 @ `0xfe000000`) |

`/proc/kallsyms` has `machine_kexec`, `machine_kexec_prepare`, `machine_shutdown`, `sys_kexec_load`, `compat_sys_kexec_load`, `kernel_kexec`, plus LG's `wdt_log_kexec_setup` and `log_buf_kexec_setup` (log regions handed across a kexec).

### kexec-tools is stock

`/usr/sbin/kexec` is **kexec-tools 2.0.12 with the arm64 patch set**, an ELF64 AArch64 binary (710 KB, dated with the firmware). `kexec -h` lists the `vmlinux`, `Image` ("compressed or not", gzip/lzma) and `uImage` types and the arm64 options `--append`, `--command-line`, `--dtb`, `--initrd`/`--ramdisk`, `--reuse-cmdline`. Its strings include `read_sys_dtb`/`read_proc_dtb`/`setup_2nd_dtb`: without `--dtb` it reuses the running kernel's `/sys/firmware/fdt`, which is what LG-TV-OSS also relies on. No cross-compiling of kexec-tools is needed; prefer this binary over a modern static build until the LG backport is proven to accept a stock-upstream kexec-tools.

LG ships it for kdump. `/etc/init/kdump.conf` (`start on core-boot-done`) runs

```
/usr/sbin/kexec -i -p /boot/kdImage-${kdver} \
    --command-line="$root $tty init=/sbin/init.kdump loglevel=6 1 maxcpus=1 reset_devices $mem $wdtlog secondkernel"
```

only when `crashkernel=` is on the cmdline. It is not on this firmware, so the job is dormant — but it means LG exercises `kexec -p` on this SoC in-house.

### Kernel images already on the rootfs

| File | Size | Format | Loadable by `kexec -l`? |
|---|---|---|---|
| `/boot/kdImage-1.0.15-169` | 3,726,208 B | raw arm64 `Image` (`ARM\x64` magic at offset 56, `text_offset=0x88000`, `image_size=0x3c5000`) | yes, directly. LG's crash kernel; pairs with `/sbin/init.kdump` (a shell script: mounts proc/sys/tmp, optional `udhcpc` on `eth0`, drops to `/bin/sh`). Presumably no display driver (3.7 MB), so it is a blind test on this TV. |
| `/boot/Image.lz4-4.4.84-169.gld4tv.5` | 11,872,808 B | LG `LZ4P` container: header `4c 5a 34 50 \| 00 ea 73 01 \| 04 2a b5 00 \| 00 00 04 00` — reads as magic, 0x0173ea00 (24.3 MB) uncompressed, 0x00b52a04 compressed (= file size − 36), 0x40000 block size. Not a standard LZ4 frame. | not directly (2.0.12 decompresses only gzip/lzma). Unpack on the host first; the container format is a guess until a tool reproduces the 24.3 MB `Image`. |

Note `text_offset=0x88000`, not the usual `0x80000` — the running kernel's code starts at `0x88000` in `/proc/iomem`. kexec-tools reads it from the Image header, so this only matters for hand-built images.

### Device tree

`/sys/firmware/fdt` exists (532,480 B). Decompiled with `dtc -I dtb -O dts`:

- `model = "LG Electronics, DTV SoC LG1314 (AArch64)"`, `compatible = "lge,lg1314", "lge,lg1k"`
- `cpus`: 4× `arm,cortex-a53`, `enable-method = "psci"`, `operating-points-v2`; `psci { method = "smc"; cpu_suspend/cpu_off/cpu_on }`
- `interrupt-controller@c0001000`: `arm,gic-400`; `generic-timer`; `pmu`
- `chosen/bootargs`: a copy of `/proc/cmdline` — it contains the MAC and serial number, so the DTB stays out of git (see [Evidence](#evidence))

What the DT describes, and whether mainline has a driver for it:

| Node(s) | compatible | Mainline driver |
|---|---|---|
| `amba/serial@fe000000` (+ `fe100000`, `fe200000`) | `arm,pl011` | yes (needs a clock — see below) |
| `amba/watchdog@fd200000` | `arm,sp805` | yes |
| `amba/timer@fd100000` | `arm,sp804` | yes |
| `amba/gpio@fd400000` … `fd510000` (18 banks) | `arm,pl061` | yes |
| `amba/ssp@fe800000`, `fe900000` | `arm,pl022` | yes |
| `amba/dma@ff200000` | `arm,pl080` | yes |
| `amba/i2c@f9000000`…`f9500000`, `fe300000`…`fe600000` (10) | `lge,lg1k-i2c` | **no** |
| `soc/ethernet@c3700000` | `lge,lg115x-macb`, `cdns,gem` | yes (`macb`) — wired Ethernet without LG code |
| `soc/usb@c30x0000` (4× EHCI + 4× OHCI) | `lge,lg115x-ehci`/`generic-ehci`, `…-ohci`/`generic-ohci` | yes, but the PHYs (`lge,lg1k-usb1phy`/`usb2phy`) are LG-only |
| `soc/mmc@c3600000` (eMMC) | `lge,lg1k-sdhci-5.0-v3` | **no** |
| `soc/crypto@e000x000` | `lge,lg1k-zacc-enc/dec` | no |
| `clks/clk-xtal`, `clks/clk-bus` | `fixed-clock` 24 MHz; `fixed-factor-clock` ×33/4 = **198 MHz** | yes — generic bindings; every AMBA node's `clocks` phandle resolves to `clk-bus`, the same 198 MHz mainline hard-codes for LG1312/LG1313 |
| `clks/clk@c9c60634`, `clk-cpu` | `lge,lg1314-clk` (CPU/DVFS) | no — only the CPU OPP table depends on it |
| `ctrl-regs/regs@c9300000` | `lge,lg1314a0-pinctrl` | no |
| `wdt_detect` | `lge,wdt-detect` (GPIO + IRQ) | no |

**Not in the DT at all**: display (`lg115x_fb`, `de`/`pe`/`be`/`gfx`/`ovi`/`te`/`tcon`), HDMI receiver (`hdmi20`), Mali (`mali.0`), Vivante `galcore`, audio (`audio`, `lg115x-codec` ×8, `lg115x-dai` ×8, `lg115x-platform`), video codecs (`vdec`, `venc`, `mjpeg`), demod/tuner, `ion-lg1k`, `hma`, `pm`. Those are platform devices registered by the **built-in** `kdrv_lg1314` (in `/sys/module` with parameters, not in `lsmod`). The DT alone never lights the panel.

**Mainline angle.** `arch/arm64/Kconfig.platforms` has `ARCH_LG1K` ("LG Electronics LG1K SoC Family"), and `arch/arm64/boot/dts/lg/lg131x.dtsi` (LG1312/LG1313) uses the same addresses as this TV one-for-one: GIC-400 @ `c0001000`, SP804 @ `fd100000`, SP805 @ `fd200000`, PL011 @ `fe000000`/`fe100000`/`fe200000`, PL022 @ `fe800000`, PL061 @ `fd400000`…, `cdns,gem`. Mainline drives them from a `fixed-clock` at 198 MHz — and the TV's own DTB already feeds them a generic `fixed-factor-clock` at exactly 198 MHz, so no DTB editing is needed for those blocks. A mainline kernel with `ARCH_LG1K` and the unmodified `/sys/firmware/fdt` (which kexec-tools passes by default) plausibly reaches a serial console, USB and wired Ethernet with no LG code at all. Untested. eMMC, display, HDMI and audio stay LG-only either way.

### SoC naming (all confirmed)

| Name | Where it appears |
|---|---|
| `M19A1` | `chip=M19A1` on the cmdline; kdriver module params `kdrv_lg1314.m19_*`; module dir `drivers/lg_kdriver/chip/m19/` |
| `LG1314` / `lg1k` | device tree model/compatible; `CONFIG_ARCH_LG1K`; built-in driver `kdrv_lg1314` |
| `m16p3` | webOS platform: `nyx-cmd DeviceInfo query device_name`; `/etc/palm/webos-preload-manager-m16p3-conf.json`; lxboot prompt `lxboot-1st@M16P3`; LG's source packages `webOS4.5_M16P3_*` |
| `M19_ATSC` | board: `nyx-cmd DeviceInfo query board_type` |
| `lg115x` | older LG driver/HAL naming still used for fb, audio, USB, macb and `libhal_lg115x.so` |
| `/proc/lg/base`: `platform 0x2000`, `chip_rev 0x23a1`, `board_opt 0x2904024` | LG's own IDs |

The SoC is not a MediaTek part: only WiFi (`wlan_mt7668`) and Bluetooth (`btmtk_usb`) are MediaTek USB parts.

### Memory map

DT `memory` node: three banks, 2 GB total — `0x00000000+0x3e400000` (996 MB), `0x4f400000+0x30c00000` (780 MB), `0xaf000000+0x11000000` (272 MB). `reserved-memory` marks the whole second and third bank `no-map` (`kdrv_buffer1`, `kdrv_buffer2`). The cmdline then hands parts back as `hma=440M@0x63000000;272M@0xaf000000`, and `/proc/iomem` shows exactly those as `System RAM` next to the first bank:

```
00000000-3e3fffff : System RAM      ← Linux proper; kernel code at 00088000
63000000-7e7fffff : System RAM      ← hma: display/video/GPU buffers
af000000-bfffffff : System RAM      ← hma
c9200000-c9203fff : mali.0
c9811000-c98117ff : galcore register region
fd200000-fd200fff : /amba/watchdog@fd200000
```

kexec-tools chooses segment addresses from the `System RAM` ranges in `/proc/iomem`. The hma banks are being DMA'd into by the display and video engines, so pass `--mem-max=0x3e3fffff` to keep the kernel, initramfs and DTB in the first bank (and check placement with `kexec -d`). `free` at idle: 1648 MB total, ~425 MB available — the staged kernel plus initramfs must fit in that.

### Kernel command line

Sanitised copy of `/proc/cmdline` (the real one also carries `ethaddr=<MAC>`, `serialNum=<serial>` and the per-unit AVS silicon-calibration values — never commit those):

```
root=/dev/mmcblk0p28 ro rootfstype=squashfs vmalloc=1044M hma=440M@0x63000000;272M@0xaf000000
kdrv_lg1314.use_vmap=1 hma.use_vmap=1 use_vmap=1 cma_on cgroup_disable=memory ethaddr=… rev=1
console=ttyAMA0,115200n81 chip=M19A1 sver=4.04.35 bver=4.04.35 quiet loglevel=0
snapshot resume=/dev/mmcblk0p48 devtmpfs.mount=1 rootwait emmc_size=0x1d2000000 sbkey=0x7e8e0000
modelopt=20000100110 hwopt=202210010004102001 portProtection mmcoops=dump wdtlog=dump@1M
ToolOpt=… countryGrp=2 debugMode=5 modelName=OLED55B9PUA serialNum=…
kdrv_lg1314.m19_avsinfo=… kdrv_lg1314.m19_cpu_avs=… kdrv_lg1314.m19_core_avs=…
criu_enabled usbcore.wisa=1 cmdEnd
```

For a kexec'd LG kernel: keep `hma=`, `kdrv_lg1314.*`, `chip=`, `sbkey=`, `modelopt=`, `hwopt=`, `countryGrp=`, `emmc_size=`, `console=`; **drop** `snapshot resume=…`, `criu_enabled`, `quiet loglevel=0` (use `loglevel=4`, not `ignore_loglevel` — LG-TV-OSS found a verbose PL011 console wedges the box). The per-TV values (`ethaddr`, `serialNum`, AVS calibration, `ToolOpt`) must be carried over out of band — LG-TV-OSS reports the LG drivers accept empty `ethaddr=`/`serialNum=` and then misbehave — so keep them in `.env`, never in a script in the repo. `--reuse-cmdline` is the lazy way to get all of this, minus the two entries that must go.

### Storage

| Location | Partition | Size / free (2026-10-26) | Notes |
|---|---|---|---|
| `/media/developer/` | p53 (`/media`, ext4) | 4.2 GB / **1.7 GB** free | largest; survives HBC reinstalls; wiped by factory reset |
| `/home/root/` | p52 (`/home`, `/var`, ext4) | 525 MB / 246 MB free | persists through updates |
| `/var/lib/webosbrew/` | p52 | (same) | where HBC keeps init.d |

Kernel ~5–25 MB, initramfs 1–100 MB. LG-TV-OSS keeps only kernel + a 1 MB boot initramfs + kexec on the TV and puts the Alpine rootfs on a USB stick; the same split fits p53.

## Watchdogs (critical)

Three different things on this TV; none of them is the O22 mechanism (a command to the micom through a mailbox).

1. **SoC watchdog, SP805 @ `0xfd200000`** — driver built in, `/dev/watchdog0` exists, and **no process holds it open** (checked every `/proc/*/fd`). The sp805 driver only starts counting when the device is opened, so it is idle on the stock system. It is not what would reset a kexec'd kernel.

2. **`wdt_detect`** — DT node `lge,wdt-detect` with a GPIO and an interrupt, kthread `wdt-detect`, `wdt_detect_isr`, plus `CONFIG_WDT_LOG` / `wdtlog=dump@1M` and `wdt_log_kexec_setup`. This is a *detector*: something external signals an imminent reset and LG saves a log region that survives the reset/kexec. Its existence is the evidence that an external reset source exists.

3. **External micom (ABOV MCU) with a host-alive signal** — `tvservice` (`/mnt/lg/tvservice/lgapp/tvservice`, the process holding `/dev/i2c-0`…`5` open) contains `API_DDM_POWER_SendHostSystemAliveSignal`, `Micom image type is ABOV`, and a debug menu with `0x10: Send HostReady CMD to MICOM`, `0x15: Send Host Alive Signal to MICOM`, `0x72/0x73: Micom Polling Enable/Disable`, `0x11/0x13/0x14` standby/activate commands, and `0x101–0x104 (internal micom)` NVM commands. `libhal_lg115x.so.2.0.1` has `HAL_SYS_WakeUpInternalMicom`; the kernel has `OVI_HW_M19_SetMcuCommand`. `/etc/init/reboot.conf` reboots "through external micom" via `com.webos.service.tv.power`. The kernel has **no** `micom`/`ucom` symbols and there is **no mailbox at `0xF0004000`** in the DT or `/proc/iomem`: on this SoC the heartbeat is presumably sent by userspace (`tvservice`) — over one of the I2C buses it holds open, or through an LG ioctl on `/dev/lg/iic*`/`/dev/lg/sys0` — to the ABOV MCU, not through the kernel mailbox LG-TV-OSS patched on O22. The transport is inferred, not shown: `tvservice` also uses those buses for the TCON and the audio amplifier.

**Unknown**: whether the ABOV micom resets the SoC when the host-alive stops, its timeout, the period, the transport (I2C bus/address, or an LG ioctl), and the message bytes. On O22 (same `lg1k` family, different micom link) it is a reset ~22 s after silence. Here `tvservice` starts on `lginit_app-ready and stopped dbus` — early, it is on the path to the 16.5 s picture — so a cold boot only shows the micom tolerates some ten-odd seconds of kernel-up silence, or expects the signal only after `HostReady`. The stock `init.kdump` second kernel has interactive prompts and no `tvservice`, which hints the budget is not tiny — circumstantial only.

How to find out (none of this has been run; the second one reboots the TV):

- **Static** (safe): decompile `API_DDM_POWER_SendHostSystemAliveSignal` in `tvservice` and its HAL path in `libhal_lg115x.so.2.0.1` with Ghidra/`rea`, the way lxboot was done — gives bus, address, payload, period. `/proc/lg/iic/debugch` can trace a channel.
- **Attended**: `kill -STOP $(pidof tvservice)` with the TV on and a stopwatch; a reset confirms the watchdog and measures the timeout; `kill -CONT` otherwise (this is how LG-TV-OSS confirmed the 22 s on O22).
- **Then** port the feeder: a kernel `early_initcall` on the `lge,lg1k-i2c` controller (needs the LG I2C driver from the GPL drop) or, if the bus is a PL061 bit-bang `iicGPIO*`, a few register pokes through `/dev/mem` from the initramfs.

## Display pipeline

- `/dev/fb0`…`fb3` from the `lg115x_fb` platform device (`CONFIG_FB=y`; LG proc at `/proc/lg/fbdev`, `/proc/lg/gfx`; `/dev/dc_fbdev`, `/dev/gfx`, `/dev/lg/gfx0`…). Pixel/tiling format unknown — the Realtek project found a tiled FBDC framebuffer that defeats raw writes; nothing similar is confirmed here.
- **GPU: Mali-T82x MP2 r1p0** (`/sys/class/misc/mali0/device/gpuinfo`, GPU ID 0x0820), `/dev/mali0`, driver `mali_kbase.ko` (`license=GPL`, 3 IRQs at `mali.0`). Userspace EGL/GLES/`libMali` blobs in bsppart are proprietary. Panfrost supports T820 but needs ≥ 5.2 plus Mesa — not an option on a 4.4 drop; LG-TV-OSS could only use it because O22 ships a 5.4 kernel (`kdrv_skip=GPU_Init` to keep kbase off the GPU).
- **Second GPU: Vivante `galcore.ko`** (`license=GPL`, registers at `0xc9811000`, module path `drivers/lg_kdriver/chip/m19/cpc/`) — a 2D/compositing core; `surface-manager`/`gm` presumably use it.
- **Display engines**: `de.0`, `pe.0`, `be.0`, `gfx`, `ovi`, `te`, `tcon`, `hdmi20` (HDMI RX; IRQs `HDMI20_TOP`/`HDMI20_LINK`/`HDMI20_AUDIO`), HDCP ESM via `linux_hld_module.ko` (`drivers/lg_kdriver/core/hdmi20/esm/…`, `license=GPL`) plus ESM firmware. All of this is inside the built-in `kdrv_lg1314`; the module paths show LG's driver tree lives at `drivers/lg_kdriver/` *inside* the kernel source, and the loadable parts are licensed GPL except `vdec_cnm.ko` (`license=Proprietary`). The O22 drops contain the kdriver source (LG-TV-OSS reimplemented the micom protocol from `kdriver/chip/o22/ucom/ucom_o22_func.c`), so the M16P3 drop is expected to contain `drivers/lg_kdriver` — to confirm when it is downloaded.

A kexec'd kernel therefore has three ways to a picture: (a) rebuild LG's 4.4 drop with `kdrv_lg1314` and reuse the stock modules + blobs (the only way to the full stack: HDR, OLED compensation, HDMI); (b) leave the display hardware as the stock kernel left it and write into the existing framebuffer from a kernel that does not touch the display engines (fragile, format unknown, no mode changes); (c) mainline + Mali later, which is years of work nobody has started.

## Audio

Platform devices `audio`, `lg115x-codec.0`–`7`, `lg115x-dai.0`–`7`, `lg115x-platform`, `soc-audio`, `/dev/lg/audio_uimc`, `/dev/lg/adec0`/`aenc0`/`aren0`…; userspace `audiod` + `pulseaudio`; firmware loaded by `fwload_audio` from bsppart. DSP firmware sizes from the earlier survey (6.5 MB + 3.1 MB) were not re-checked. For an HDMI-monitor use case, HDMI audio passthrough through LG's pipeline is the realistic target; LG-TV-OSS reports "basic audio" on O22 with a DSP race at boot.

## Other hardware

| Subsystem | Driver on the stock system | Source situation |
|---|---|---|
| WiFi MT7668 (USB) | `wlan_mt7668.ko`, `license=Dual BSD/GPL`, firmware in `/lib/firmware` | module + blob reusable with a matching 4.4 kernel |
| Bluetooth MTK (USB) | `btmtk_usb.ko`, `/dev/stpbt*` | same |
| Ethernet | `cdns,gem` (`macb`) | **mainline** |
| USB | `generic-ehci`/`generic-ohci` + `lge,lg1k-usb*phy` | mainline host, LG PHYs |
| eMMC | `lge,lg1k-sdhci-5.0-v3` | LG-only; needed for `root=` on eMMC |
| I2C ×10 + bit-bang `iicGPIO0-3` | `lge,lg1k-i2c`, LG proc at `/proc/lg/iic` | LG-only; carries the micom link |
| IR / input | `lginput2` (userspace) + `/dev/lg/*` | LG |
| HDMI-CEC | LG (`eim`, `physical-device-manager`) | LG |
| OLED pixel protection | `oled-epl` (userspace) over LG panel drivers | LG; leaving it off risks burn-in |
| Tuner/demod | `si2178b`, `atsc_dtv_soc`, `dvb_*` modules | irrelevant for HDMI use |

## Community kexec projects (checked 2026-10-26)

| Project | Target | What is proven | Relevance to the B9 |
|---|---|---|---|
| [ggfuchsi-oss/lg-webos-kexec](https://github.com/ggfuchsi-oss/lg-webos-kexec) (9 ★, updated 2026-10-24) | LG 50UP81009LR, 2021, webOS 6.5, **Realtek RTD2875**, armv7l (A55 in AArch32), kernel 4.4.84 | `kexec -l` stages the TV's own kernel (`kexec_loaded` 0→1→0), `kexec -e` works, a from-source kernel reaches userspace, framebuffer canaries draw. **Resets after 10–21 s**: the Realtek SoC watchdog (`TCWCR/TCWOV/TCWTR` @ `0xFE0622xx`) is fed by the stock kernel's `micom_wdt_thread()`; the userspace `micom-pet.c` fix via `/dev/mem` is written but unproven live. Display is tiled FBDC — no text console. | Different SoC. The method is the template: safe stage/unload PoC first, DTB from `/sys/firmware/fdt`, attended `kexec -e`, "pull power = stock". Authored largely by an AI agent (disclosed). |
| [Pokropow/LG-TV-OSS](https://github.com/Pokropow/LG-TV-OSS) (1 ★, updated 2026-10-17) | LG OLED65C21LA, 2022, **LG1213 "o22"**, aarch64, LG 5.4.96 / 5.4.268 GPL drops | kexec boot of a modified stock kernel, Alpine root on USB, UART + telnet, Ethernet, basic GPU (panfrost on 5.4) and audio, Plasma Bigscreen; 4K at 15 fps. Static kexec-tools 2.0.32, **no `--dtb`** (stock FDT reused), `fix_stuck_cpus.ko` to get past `cpus_are_stuck_in_kernel()`. **Micom solved**: a separate always-on MCU resets the SoC ~22 s after silence; stock feeds it from `/usr/sbin/micomservice`; patch `0001-lg1k-micom-watchdog-petting.patch` adds `drivers/soc/lg1k/micom_pet.c` — a 3-byte read of command `0xC0` through the ARM→MICOM mailbox at `0xF0004000`, every 200 ms from `early_initcall`, protocol copied from `kdriver/chip/o22/ucom/ucom_o22_func.c`. | Same `lg1k` family and the same workflow (GPL drop + kdriver, kexec from HBC, USB rootfs). The micom *mechanism* does **not** transfer: LG1314 has no `0xF0004000` mailbox and the heartbeat is userspace I2C (above). The kdriver-in-the-drop finding and the cmdline hygiene (`tv-env.sh` kept off the TV and out of git) do. Code is largely AI-generated (disclosed). |
| [throwaway96/webos-kernel-drivers](https://github.com/throwaway96/webos-kernel-drivers) | many webOS SoCs | "Kernel modules for various webOS versions/SoCs. Mostly serial drivers." Lists M16P3 under LX in a non-exhaustive SoC list; ships `ch341.ko`/`cp210x.ko` in an `aarch64-4.4.84-lx` folder; says to get source and toolchain from opensource.lge.com. | Shows a 4.4.84 aarch64 LX tree has been built by someone; it is not a driver-extraction tool and not a confirmation of anything about M16P3 specifically. |

LG-TV-OSS's micom fix on O22 (command `0xC0` through a mailbox) is specific to that SoC and does not carry over to this TV.

## Kernel source

[opensource.lge.com](https://opensource.lge.com/) (TV/AV › TV). The product search is an AJAX call, `GET /product/list-data?ctgr=005&subCtgr=006&keyword=…&schType=1|2&page=N` (`schType=1` = model, `2` = description); downloads go through `POST /download/releaseFile` with the `osSeq` the page's `download(osSeq, model, fileType, fileIdx, filename)` handler passes.

| Search | Result |
|---|---|
| Model `OLED55B9PUA` / `OLED65B9PUA` / `OLED55C9PUA` (any TV sub-category) | **no rows** — the US models are not listed |
| Model `OLED55B9` | `OLED55B9CNA`, `OLED55B9DLA`, `OLED55B9FCA`, `OLED55B9FNA`, `OLED55B9GNA` with descriptions `webOS 4.5 IMP` (osSeq 508990, notice 2019-03-04), `IMP 2.0` (509010, 2019-04-23), `IMP 3.0` (509238, 2019-07-10), `IMP 4.0` (510773, 2022-01-13); FNA/GNA also `webOS 4.5 IKLP 3.0/4.0` |
| Description `M16P3` | `webOS4.5_M16P3_CommercialTV` (509112) and `webOS4.5_M16P3_TVSignage` (509113) for 2019 commercial sets |
| Description `webOS 4.5` | 3,600+ rows; the `IMR x.0` train is the non-OLED 2019 line |

So the drop to request is **`webOS 4.5 IMP 4.0`** (osSeq 510773) — the B9's own hardware under its non-US model numbers — with `IKLP 4.0` (510775, listed for the FNA/GNA variants) as the other candidate train if IMP turns out not to match a US unit, and the `M16P3_CommercialTV` package as a second copy of the same platform. Caveats: the running kernel was built 2024-07-03, after the IMP 4.0 notice, so expect drift between the drop and `4.4.84-169.gld4tv.5` (`MODULE_IGNORE_SUBVER` hides it at `insmod`, not at runtime); and LG only lists what it lists — the inquiry form / opensource@lge.com is the fallback for the exact `05.40.45` tree.

## What a custom OS looks like

Three kernel strategies, in increasing order of ambition:

1. **LG's own kernel, re-kexec'd** — the unpacked `/boot/Image.lz4` with the stock cmdline minus `snapshot resume=`/`criu_enabled`. Proves the transition on LG1314 with zero build work; the stock userspace boots again and the picture comes back. (LG-TV-OSS's first milestone on O22.)
2. **LG's 4.4.84 GPL drop, rebuilt and trimmed** — same config, `CONFIG_BLK_DEV_INITRD=y`, `kdrv_lg1314` kept for display/HDMI/eMMC, tuner/CRIU/snapshot dropped, a micom feeder added. Stock modules and firmware reused. This is the realistic route to a usable panel.
3. **Mainline `ARCH_LG1K` + TV DTB** — serial, USB, Ethernet, GPIO, I2C-via-bitbang only. A debugging and bring-up kernel, not a product.

```
custom-initramfs (aarch64, or armv7 via CONFIG_COMPAT)
├── /init                       busybox (static, ET_EXEC — LG-TV-OSS's hard-won advice)
├── micom feeder                early, before anything slow
├── /lib/firmware/              WiFi/BT/audio/HDMI blobs copied from stock
├── /lib/modules/               stock .ko files (vermagic 4.4 + "SMP preempt mod_unload aarch64")
├── dropbear, wpa_supplicant    SSH over Ethernet first (macb), WiFi second
└── /opt/gui/                   fbdev / EGL-on-Mali / Wayland client
```

Display options for the GUI: direct framebuffer, Weston/Cage on a DRM/KMS stack (none exists yet), or an EGL/GLES app on the Mali blob.

## kexec transition concerns

- **Micom** — see above; nothing else matters until it is understood.
- **Hibernation resume** — remove `snapshot resume=…` or the kexec'd LG kernel resumes the Quick Start+ image from p48.
- **Segment placement** — `--mem-max=0x3e3fffff` (hma banks are live DMA targets); verify with `kexec -d`.
- **CPUs** — `machine_shutdown` offlines CPUs 1–3 with PSCI `cpu_off`; LG's PM already hot-unplugs CPUs at idle (`cpu3` was offline during the survey; `/proc/lg/pm/mp_enable`), so this path is exercised daily.
- **Display state** — the panel keeps showing the last stock frame; a kexec'd kernel without display code leaves it frozen, not black. A frozen stock UI is the expected "success" look of milestone 1b.
- **No initrd for LG images** — milestones that use `kdImage` or the stock `Image` must use `root=` (p28 squashfs for the stock kernel; anything for the custom one).
- **`kexec -e`** runs the reboot path (syncs, kills nothing by itself); `-f` skips `shutdown`, `-i` skips the memory checks LG passes for kdump.

## Development workflow

Every step from 1 on reboots the TV on failure; a failed kexec is a power cycle back to stock (nothing on eMMC changes). Step 0 is the first action on this TV that is not read-only — ask first.

0. **Stage and unload, no reboot** (the lg-webos-kexec PoC): `kexec -l /boot/kdImage-1.0.15-169 --append="root=/dev/mmcblk0p28 ro rootfstype=squashfs rootwait console=ttyAMA0,115200n81 init=/sbin/init.kdump loglevel=6 maxcpus=1" --mem-max=0x3e3fffff -d`, read `/sys/kernel/kexec_loaded` (expect `1`), `kexec -u` (expect `0`). Proves the LG backport accepts a load and shows where segments land.
1. **Attended, re-kexec LG's kernel**: unpack `Image.lz4` on the host, stage it with the stock cmdline minus `snapshot resume=`/`criu_enabled`/`quiet loglevel=0`, `kexec -e`. Success = the stock UI comes back and SSH works; measure the transition time. Failure modes: frozen frame then reset (watchdog or hardware state) → the micom question gets an empirical answer for free. 1b: the same with `kdImage` + `init=/sbin/init.kdump` (blind; only "does it stay up" is observable).
2. **Micom**: static RE of `SendHostSystemAliveSignal`; attended `kill -STOP tvservice` test; write the feeder.
3. **GPL drop**: request `webOS 4.5 IMP 4.0`; build the stock config unchanged; kexec it; then enable `BLK_DEV_INITRD`, strip, add the feeder.
4. **Debug console**: no B9 UART pads are known (recovery.md), so wire SSH over Ethernet into the initramfs early (`macb` is mainline).
5. **Display**: `kdrv_lg1314` + stock modules + blobs in the rebuilt kernel; get `/dev/fb0` writes on screen; then Mali.
6. **Initramfs/rootfs**, audio, GUI, persistence from p53 via HBC init.d.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Micom resets the TV mid-boot | high until solved | low (reboots to stock) | find the I2C host-alive first; feed it from `early_initcall` |
| Segments land in hma banks and get overwritten by DMA | medium | low | `--mem-max=0x3e3fffff`, `kexec -d` |
| Kexec'd LG kernel resumes the snapshot | certain if `snapshot resume=` is kept | low | strip it |
| No display after kexec | certain for mainline, medium for the rebuilt LG kernel | medium (blind) | SSH over Ethernet first |
| No UART | certain (no pinout) | medium | Ethernet |
| GPL drop drifts from `4.4.84-169` | likely (2022 drop vs 2024 build) | medium | stock modules still load (`MODULE_IGNORE_SUBVER`); ask LG for the exact tree |
| `kdrv_lg1314` source missing from the drop | unknown | high for display | check the O22 precedent; the loadable kdriver parts are GPL-licensed |
| Bricking | none from kexec itself | — | kexec writes RAM only; the eMMC backup and recovery paths in [recovery.md](recovery.md) cover everything else |

## Effort estimate

| Phase | Effort | Dependencies |
|---|---|---|
| Stage/unload PoC + re-kexec of LG's kernel | hours | unpacking `LZ4P`, someone at the TV |
| Micom host-alive RE + feeder | days | Ghidra on `tvservice`/`libhal_lg115x`; one attended test |
| GPL drop builds and boots via kexec | days | LG delivers IMP 4.0; toolchain |
| Minimal custom kernel + initramfs with SSH | days | above |
| Display (fb, then Mali) | weeks–months | kdriver source quality |
| Audio | days–weeks | blobs + ALSA/pulse config |
| GUI | weeks | display |
| **Usable HDMI-monitor OS** | **1–3 months** | active development |

What the read-only survey changed: the kexec-tools and device-tree work disappears (both are on the TV), the display work is better understood (GPL kdriver, two GPUs identified), and the micom work changed shape (I2C from userspace, not a kernel mailbox).

## Comparison with Path B

| Dimension | Path B (late overlay) | Path C (kexec) |
|---|---|---|
| Time to deploy | hours | weeks to a shell, months to a panel |
| Boot time | 35 s stock + instant takeover | 35 s stock + transition + custom boot |
| Control level | userspace only, stock kernel | everything after ~35 s |
| Custom GUI | web app in stock WebAppMgr | anything, once the display stack works |
| Service control | kill/replace after they start | they never start |
| Risk | low (revert = delete script) | low per attempt (revert = power cycle) |
| Development effort | scripting | kernel build + driver and micom RE |
| Display quality | stock (HDR, OLED compensation) | unknown until `kdrv_lg1314` runs in the custom kernel |

Path B remains the practical starting point. Path C is the endgame for a TV that should never run LG's services at all; it does not shorten the 35 s preamble.

## Evidence

All read-only, 2026-10-26, over `ssh root@$TV_HOST`: `/proc/version`, `/proc/cmdline`, `/proc/config.gz`, `/proc/kallsyms`, `/proc/iomem`, `/proc/interrupts`, `/proc/cpuinfo`, `/proc/mounts`, `/proc/sys/kernel/kexec_load_disabled`, `/sys/kernel/kexec_*`, `/sys/firmware/fdt` (+ `dtc -I dtb -O dts`), `/sys/class/misc/mali0/device/gpuinfo`, `/sys/bus/platform/devices`, `/sys/class/watchdog`, `/proc/*/fd` and `/proc/*/comm`, `lsmod`, `/sys/module`, `/etc/init/kdump.conf`, `/etc/sysconfig/kdump.conf`, `/sbin/init.kdump`, `/etc/init/{reboot,lginit_app}.conf`, `/boot/*` headers via `od`, `strings` on `/usr/sbin/kexec`, `tvservice`, `/usr/sbin/tvpowerd`, `/usr/lib/libhal_lg115x.so.2.0.1`, module `vermagic`/`license` strings, `/proc/lg/{base,iic,pm,sys}`, `nyx-cmd DeviceInfo query device_name|board_type`, `df`, `free`. Mainline references from kernel.org (`arch/arm64/Kconfig.platforms`, `arch/arm64/boot/dts/lg/lg131x.dtsi`); community repos read through `gh api` and shallow clones; LG's listing through `/product/list-data`.

The decompiled DTB (`lg1314.dts`, 879 lines) is kept with the backup, **not in git**: its `chosen/bootargs` carries the MAC and serial number. Re-dump with `ssh root@"$TV_HOST" cat /sys/firmware/fdt > lg1314.dtb && dtc -I dtb -O dts -o lg1314.dts lg1314.dtb`.
