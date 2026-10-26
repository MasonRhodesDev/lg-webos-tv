# Custom boot research

Research into cutting the LG B9's 35-second boot time and gaining early control of startup. 2026-10-25.

## The bsppart overlay — early boot hook

The bsppart partition (p30, 28MB squashfs) is the Board Support Package layer. It's mounted as a read-only overlay on `/` via `pivot_root`, **before any service starts**. This is the earliest possible userspace hook.

### Boot sequence (relevant portion)

```
kernel → init.upstart
  → SetInitEnv.conf (start on startup — the FIRST upstart event)
    → sets PATH, LD_LIBRARY_PATH (both include /mnt/bsppart/bsp/...)
    → emits start-mount-bsp
  → mount-bsp.conf:
    1. mount -t squashfs /dev/mmcblk0p30 /mnt/bsppart
    2. mount -t overlay overlay -olowerdir=/mnt/bsppart/bsp:/ /mnt/bsppart/merged
    3. pivot_root . old_root
    4. initctl reload-configuration   ← upstart re-reads /etc/init/*.conf from overlaid root
  → bootd starts (emits core-boot-done, init-boot-done, minimal-boot-done, ...)
  → all services start, reading configs from the overlay
  ...
  → devmode.conf → HBC startup.sh → init.d scripts (~35s mark)
```

Files placed in the bsppart squashfs under `bsp/` override the rootfs at the corresponding path. After `pivot_root` + `initctl reload-configuration`, upstart uses the overlaid `/etc/init/` for all subsequent job starts.

### What bsppart already contains

Not empty — it's the full M19 BSP:

- **Upstart configs**: `bluetoothdrv-mtk.conf`, `gpu-libs.conf`, `kadpd.conf`, `kdrivers*.conf`, `ruta.conf`, `webos-tv.conf`, `wifidrv*.conf` — these override the generic rootfs versions
- **Kernel modules**: Mali GPU, DVB/ATSC tuner drivers, WiFi (MT7668), Bluetooth (MTK), filesystem (tuxera NTFS/FAT), `webos_tv.ko`
- **Libraries**: `libsb.so` (the signature verification library itself), all HAL libs (`libhal_*.so`), GPU libs (Mali EGL/GLES), `libkadaptor.so`, `libhma.so`
- **Firmware**: WiFi/BT firmware blobs (same as `/lib/firmware/`)
- **Binaries**: `kadpd`, `ruta`, `fwloader`, `fwload_audio`, `se_kadpd`, `pmt`, `upmt`, `tu_debug`

### The hypothesis

If bsppart is **not verified by lxboot at boot time** (only by securitymanager later at runtime), then:

1. Write a custom bsppart squashfs with modified `bsp/etc/init/` configs
2. `dd` it to p30 (active bsppart)
3. On boot, the kernel mounts it, `pivot_root` overlays it on `/`, upstart reloads
4. Our custom startup configs run from the first service onward
5. At ~35s, HBC init.d runs and kills securitymanager before its runtime check notices the modified partition

This would give full control of the boot sequence from the earliest possible point, with no timing gap.

### Answer: YES, lxboot verifies bsppart at boot

**Confirmed 2026-10-25** by disassembling the lxboot binary (p4, AArch64 raw image) with Ghidra headless.

lxboot contains an 8-entry partition verification table at data address `0xc95b0`. After loading, decompressing, and verifying the kernel image (`sb_verify_image`), lxboot calls an application-verification loop (`FUN_0004b1e4`) that iterates this table and calls `sb_verify_application` on each entry:

```
Entry  Flag   Partition    Verified on normal boot?
-----  ----   ---------    ------------------------
  [0]  0x01   rootfs       YES
  [1]  0x03   swue         SKIPPED (only during firmware update)
  [2]  0x03   tzfw         YES
  [3]  0x01   tvservice    YES
  [4]  0x01   otncabi      YES
  [5]  0x01   otycabi      YES
  [6]  0x01   bsppart      YES  ← confirmed
  [7]  0x01   license      SKIPPED (when partition size == 0)
```

The flag field is ANDed with `param_1` (passed as `1` on normal boot) to decide whether to verify. All `0x01` and `0x03` entries satisfy `(1 & flag) != 0`, so all are checked except swue (explicitly skipped outside update mode) and license (skipped when empty).

**On verification failure**, lxboot either:
- Attempts backup-partition boot (swaps to the other A/B slot), or
- **Enters an infinite loop** (hard halt, requires power cycle + recovery)

The verification uses `sb_verify_application` (fragment-based RSA-2048 signature check using hardware crypto `KADP_SE_SB*` calls). The key material is in SoC OTP fuses, inaccessible from software.

**Chicken-and-egg resolved**: lxboot has its OWN verification implementation compiled into the bootloader binary — it does not use `libsb.so` from bsppart. The `sb_verify_image` and `sb_verify_application` functions at `0x9d7cc` and `0x9e11c` in the lxboot binary are standalone, calling hardware crypto directly. The `libsb.so` in bsppart is a separate userspace copy used only by securitymanager at runtime.

**Analysis method**: Extracted code section from lxboot image (offset 0x10000, 2MB AArch64), imported into Ghidra with `AARCH64:LE:64:v8A` processor. Found partition name strings via `find()`, mapped cross-references to the verification loop via the data table. Runtime pointers (base `0x780c0000`) resolved to file offsets to decode all 8 table entries. Decompiled both the verification loop and the main boot function to trace the complete call chain.

## Verification architecture

### Boot-time (lxboot, pre-Linux) — CONFIRMED BY BINARY ANALYSIS

- Two verification functions in the lxboot binary:
  - `sb_verify_image` (at `0x9d7cc`) — verifies the kernel image (full image check)
  - `sb_verify_application` (at `0x9e11c`) — verifies app partitions (fragment-based sampling)
- 8-entry verification table: rootfs, swue, tzfw, tvservice, otncabi, otycabi, **bsppart**, license
- RSA-2048 via hardware crypto (`KADP_SE_SB000`/`SB002`/`SB003` calls)
- Verification key in M19A1 SoC OTP fuses, never enters main memory
- On failure: infinite loop (brick) or backup-slot boot attempt
- Retry logic: up to 3 attempts per partition before declaring failure
- Runs before Linux kernel starts — cannot be intercepted from userspace

### Runtime (securitymanager, post-boot)

- `sb_verify_task` — spawned as a thread inside securitymanager
- Fragment-based sampling: `get_fragment_offset`, `sb_get_fragment_number` — reads random 128KB fragments
- Reads from raw block device (`/dev/mmcblk0p%d`), **not through the filesystem overlay**
- On snapshot-resume boots only (cold boot skips? — **unverified**)
- On failure: `xpa_tv_sysproperty_setVerifyFlag` sets the full-verify NVM flag, system shuts down, next boot does full lxboot verify
- Partitions checked: rootfs, kernel, bsppart, tvservice, otncabi, otycabi, fonts, tzfw, license
- securitymanager is an ordinary upstart service (`start on minimal-boot-done`, `respawn`)
- Can be killed/replaced via HBC init.d bind mount at ~35s

### Overlay vs. raw verification

The overlay does **not** affect verification: securitymanager reads from the raw block device, bypassing the VFS overlay entirely. A writable overlay on `/` leaves the underlying partition untouched and passes both lxboot and runtime checks.

However, a **modified bsppart squashfs written to the partition** does change the raw block device and would be detected by any verification that covers bsppart.

## Paths forward

### Path A: bsppart modification — RULED OUT

lxboot verifies bsppart at boot (see above). A modified bsppart squashfs would fail RSA signature verification and halt the TV or force backup-slot boot. Without LG's private signing key, this path is closed.

### Path B: Late overlay (current best option)

**Impact**: Custom services from ~35s onward. Stock boot for the first 35s.

1. HBC init.d script mounts writable overlay on `/` from data partition
2. Places modified configs, kills and restarts services
3. securitymanager killed and replaced with a no-op or patched version

**Limitation**: 35-second stock preamble. Cannot prevent stock services from starting initially.

### Path C: kexec (full custom OS)

**Impact**: Complete control, including custom kernel.

1. Stock boot chain runs to ~35s (HBC)
2. `kexec -l` loads custom kernel + initramfs
3. `kexec -e` replaces running kernel
4. Custom init starts fresh

**Prerequisites confirmed** (2026-10-26, read-only): `CONFIG_KEXEC=y` and `kexec_load_disabled=0` in the running kernel; `/usr/sbin/kexec` is already an aarch64 kexec-tools 2.0.12 with arm64 support (LG ships it for kdump); `/sys/firmware/fdt` exposes the device tree (SoC `LG1314`, `lge,lg1k`); LG's crash kernel `/boot/kdImage-1.0.15-169` is a raw arm64 `Image`. Details, corrections and the milestone plan: [path-c-kexec.md](path-c-kexec.md).

**Limitation**: ~35s stock boot + kexec transition. Needs the `webOS 4.5 IMP 4.0` GPL drop (listed for the B9's non-US model numbers, not for OLED55B9PUA) and driver work for the display pipeline, the micom host-alive signal, and audio. No existing LG1314/M16P3 kexec work; the community projects target other SoCs: [ggfuchsi-oss/lg-webos-kexec](https://github.com/ggfuchsi-oss/lg-webos-kexec) (Realtek RTD2875, reaches userspace, still watchdog-reset) and [Pokropow/LG-TV-OSS](https://github.com/Pokropow/LG-TV-OSS) (LG1213 "O22", boots Alpine; micom fed via a kernel mailbox at `0xF0004000`, cmd `0xC0`). That mailbox does not exist on LG1314 — here the heartbeat is presumably sent by userspace `tvservice` (over I2C or an LG ioctl) to an external ABOV micom, and whether it resets the SoC when it stops is untested.

### Path D: Kernel command-line injection via NVM/bootloader env — RULED OUT

**Impact**: Would have given full control from kernel init, no 35s wait.

**Confirmed 2026-10-26** by decompiling the lxboot env system (env_save at `0x78121700`, env_load at `0x78121944`, getenv at `0x781214ac`, set_initfile_path at `0x78122404`).

lxboot has a full environment variable system ("env_nvm") stored in the env_nvm partition (referenced via the partinfo table). The env stores key-value pairs in a TLV format with magic `0x14052011`. Three env vars flow into the kernel cmdline:

- **`initfile`** — injected into the root= line: `root=%s %s %s rootfstype=%s%s` (3rd %s). Default: NULL (→ empty string). The `set_initfile_path` shell command sets it to `"init=/path/to/custom"` and saves it. When set, replaces the stock init.
- **`bootopts`** — prepended to the ethaddr section of cmdline: `%s ethaddr=%s rev=1 console=...`. Default: NULL (→ empty).
- **`bootargs`** — in 'u' boot mode (iVar7==3), replaces the ENTIRE kernel cmdline with this value. Not used in normal boot (mode 2).

The default env table (16 entries at `0x7818a288` in lxboot) contains only: ethaddr, ipaddr, netmask, gatewayip, dnsserver, serverip, nfsserver, transserver, tftpblksize, print, bootdelay, devicenode, cma, kdump, shw_print, ddr_size. None of bootargs/bootopts/initfile have defaults — they start NULL.

**Why it's ruled out**: The environment blob is **cryptographically signed** using the same hardware crypto as partition verification:

- `env_save` (FUN_78121700) calls `FUN_7815d8dc` (sb_sign) after serializing the env. The signature is appended to the data blob and written to the env_nvm partition.
- `env_load` (FUN_78121944) calls `FUN_7815d99c` (sb_verify) on load. On signature failure, it prints "fail verify env", **resets the env to defaults**, and re-saves with a fresh signature.
- The signing/verification uses the same `KADP_SE_SB*` OTP-fused key material as partition verification.

A modified env_nvm partition written from userspace would fail signature verification and be replaced with defaults on the next boot. Without LG's private signing key, env modification is cryptographically blocked.

**The `set_initfile_path` and `setenv` commands exist in the lxboot shell**, which would allow legitimate modification with a valid signature — but the shell is locked behind `debugMode=5` (RELEASE mode). `debugMode` is read from a separate NVM function (`FUN_78109e84`), not the env system, and is also protected.

**Analysis method**: Ghidra headless decompilation of the full 2MB lxboot image (p4, AArch64 @ base 0x780c0000). String search found `bootargs`/`bootopts`/`initfile`/`env_nvm`/`env_save`/`env_load`/`setenv`/`init=/sbin/init`/`init=%s`/`debugMode`. Decompiled 10 functions referencing these strings. The env_save/env_load signature chain was traced through the sign/verify call pairs. The default env table was extracted by following pointers from `env_set_default` (FUN_78121560).

**Risk** (academic — the path is closed): The env_nvm partition has no A/B backup. A corrupted write would trigger "fail verify env" → defaults reset → boot continues normally. A structurally valid but unsigned blob would also reset to defaults. Only a write that corrupts the partition at the block level (partial write during power loss) could potentially brick, but the partinfo fallback to mapbak provides some resilience.

### Path E: initramfs/rootfs race

**Impact**: Custom code before securitymanager, after kernel.

If the kernel's built-in initramfs or early rootfs mount has a writable window (e.g., writing to `/dev/mmcblk0p30` from an init.d that runs before securitymanager's `minimal-boot-done`), a script could:

1. Run early in the upstart sequence (before `minimal-boot-done`)
2. Bind-mount modified configs over stock ones
3. Prevent stock services from starting

**Status**: Needs identification of an upstart job that runs before `minimal-boot-done` and after the data partition is mounted (which provides writable storage). The HBC devmode.conf approach triggers too late; a custom upstart job added via the data partition might work if there's a mechanism to inject one.

## Verdict: what's left

| Path | Status | Blocks early boot? |
|------|--------|--------------------|
| A: bsppart mod | **RULED OUT** — lxboot verifies at cold boot (RSA-2048, OTP keys) | would have |
| B: Late overlay (HBC) | **WORKING** — current best option | no (35s preamble) |
| C: kexec | **POSSIBLE** — needs M19A1 kernel source + driver work | no (35s + transition) |
| D: NVM env injection | **RULED OUT** — env blob is cryptographically signed with OTP keys | would have |
| E: Early upstart race | **UNLIKELY** — needs a writable hook before minimal-boot-done | partially |

Every path to early boot control (before ~35s) is blocked by the same wall: LG's OTP-fused RSA keys sign the bootloader, kernel, partitions, AND the env. Without the private key, the earliest controllable point is HBC at ~35s.

The remaining realistic options are:
1. **Path B (late overlay)**: Maximize what can be done at 35s — kill services, overlay configs, replace securitymanager. Achieves the goal of custom services and trimmed startup, just with a 35-second stock preamble.
2. **Path C (kexec)**: After the 35s stock boot, load a completely custom kernel+initramfs. Total control after a 35s+transition delay. Heavy development investment (M19A1 drivers). Community kexec projects target different SoCs.
3. **Snapshot boot (Path B + hibernation)**: Apply the late overlay, then snapshot the modified state to p48 via `snapshot-boot-manager --make`. Every subsequent cold boot resumes into the custom runtime in ~3–5 s. p48 is NOT in lxboot's RSA verification table; the signing is done by `libsb.so` from root. See [snapshot-boot.md](snapshot-boot.md) for the full analysis.

## Stock boot timeline

| Time | Event | Notes |
|------|-------|-------|
| 0s | Power on, secureboot → lxboot | Hardware, ROM-verified |
| ~1s | lxboot verifies kernel + all 8 app partitions | RSA-2048 fragment check |
| ~3s | Kernel starts, mounts rootfs squashfs | |
| ~3s | init.upstart starts | |
| ~3s | SetInitEnv.conf → mount-bsp.conf | **bsppart overlay + pivot_root here** |
| ~4s | `initctl reload-configuration` | Upstart re-reads all configs from overlay |
| ~5s | bootd starts, emits boot stages | core-boot-done → init-boot-done → ... |
| ~16.5s | HDMI picture (splash/logo) | |
| ~31s | minimal-boot-done, boot-done | securitymanager, devmode start |
| ~35s | HBC startup.sh → init.d | **Earliest writable hook currently** |

## Recovery safety net

- USB EPK 05.40.97 (988MB) — downloaded, `<backup dir>/epk/` (kept out of git)
- USB EPK 05.50.00 (988MB) — downloaded, `<backup dir>/epk/` (kept out of git)
- Full eMMC backup with all 53 partitions — `<backup dir>/2026-10-25/boot2/` (see [backup-and-restore.md](backup-and-restore.md))
- Original bsppart image — `boot2/images/s*_mmcblk0p30.img`
- dd-restore from SSH if TV boots
- USB recovery if it doesn't (forward update to 05.40.97+)

## EPK status

| Version | Purpose | Status |
|---------|---------|--------|
| 05.40.45 | Current active slot | Not available (LG removed from support page) |
| 05.40.20 | Backup slot | Not available |
| 05.40.97 | Recovery (forward) | Downloaded ✓ |
| 05.50.00 | Recovery (forward) | Downloaded ✓ |

Remaining leads for exact-version EPKs: Telegram `t.me/lgwebosusb`, lgwebos.com forum (login required), LG customer support.
