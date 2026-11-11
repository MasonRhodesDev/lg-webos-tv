# Partition writes, restore & recovery

Read-only research, 2026-10-25. Binaries were streamed off the TV and analysed with REA (Ghidra) on local copies. Only small raw reads were made on the TV. Claims are tagged **verified** (on device or in code), **community** (reported elsewhere) or **inferred**.

## Verdict

- **A dd backup can be restored, for most partitions, from the running rooted system**, with two conditions:
  1. **Restore by physical eMMC offset, not by `pN` number.** LG's A/B "flip" swaps the partition-table entries themselves. After any update or revert, `mmcblk0p28` points at the other physical region. *(verified: `SWUPDATE_SwapDoublePartition`)*
  2. **Restore partinfo (p2), mapbak (p3) and crc32info (p9) together, as a matched trio.**
- **Signatures don't block a byte-identical restore.** Each signed image carries its own trailer at `fileSize − 0x2110` (magic `0x3ce7a63e`). Writing the exact original bytes back, with partinfo's `fileSize` for that slot, reproduces a valid signature. *(verified: trailer present in both rootfs slots)*
- **Cannot be restored from software:**
  - the **active** slot while mounted (writing the live rootfs crashes the TV);
  - **p1 secureboot / p4 lxboot** (possible, highest brick risk);
  - the per-device secret partitions from any source but this TV's own copy;
  - **RPMB** (not capturable at all).
- **For a TV that doesn't boot, the only general recovery is direct eMMC programming (ISP or chip-off).** The bootloader is in RELEASE mode (`debugMode=5`). On webOS 4+, DEBUG can't be enabled once the system no longer boots *(community: [downgr8](https://github.com/throwaway96/downgr8))*.

### Minimum safety net before any risky change

1. The official **signed USB EPK** for this model at the current version (05.40.45) and the backup-slot version (05.40.20). Without them there's no USB or swue recovery.
2. Know that same-version or downgrade USB updates and slot revert need **expert mode**. downgr8 provides it on a rooted, booting TV.
3. Don't count on UART: the bootloader is locked, and no B9 pinout is known.
4. Keep every risky write off **p1, p2, p3, p4, p8, p9, the active set**, and the device-secret partitions.

## Partition map

Kernel `pN` = LG partinfo index N. There is no GPT, `/dev/block/by-name` or sysfs `PARTNAME`; names come from `/proc/partinfo`.

The partinfo header (magic `0x20120716`) holds `curEpk` / `oldEpk` and 54 entries of 0x60 bytes, plus a CRC32. p2 and p3 are currently byte-identical. The kernel extends p53 to the end of the disk.

| p | Role | Mounted | Updater writes | Verified by | Restore |
|---|---|---|---|---|---|
| 1 | secureboot (1st stage, RSA, shadow ROM) | no | in place | ROM/OTP secure boot | ISP only |
| 2 / 3 | partinfo / mapbak — **the A/B flag** | no | yes | CRC32; lxboot falls back to mapbak if partinfo is corrupt | live possible, highest risk; with p9 |
| 4 / 5 | lxboot (p4 in use, p5 empty) | no | yes | lxboot signature | live = brick risk; ISP |
| 6 / 7 | swue updater mini-OS (p6 in use) | no | yes | lxboot (EPK/PAK only) | p7 safe-ish; p6 risky |
| 8 | emergency (`SWUM` magic boots swue) | no | yes | — | writing it forces swue |
| 9 | crc32info (per-partition CRCs, swapped with entries) | no | yes | — | with p2/p3 |
| 10–14, 16–20 | per-device secrets (MAC, NVM env, DRM, certs, CAS, secure store) | no | no | device-bound encryption | this TV's own copy only |
| 15 | authcxt (CI+) | ext4 rw | no | — | when unmounted |
| 21 / 22 | kernel A/B (p21 in use) | no | yes | lxboot `sb_verify_image` | p22 safe-ish; p21 risky |
| 23 / 24 | sedata (keys bound to OTP) | no | p23 | key-bound | own copy, never swap |
| 25–27, 36–37 | logo / hwsetting / pmsfw (+ backups) | no | yes | — | live |
| **28–35** | **active set**: rootfs, tvservice, bsppart, otncabi, otycabi, fonts, tzfw, license | squashfs ro | A/B | signed trailer; securitymanager + lxboot | ISP or slot swap; never live |
| **38–45** | **backup set** (05.40.20) — updates are written here | no | **yes** | same trailers | dd while inactive is safe |
| 46 / 47 | uhdcp / profdata | p46 ext4 | no | — | unmounted |
| 48 | hib — CRIU snapshot (`resume=/dev/mmcblk0p48`) | no | regenerated ("make hib") | lxboot + `sb_sign_snapshot_image` | regenerable; don't restore an old one |
| 49 / 50 | dump / hist | no | — | — | live |
| 51 / 52 / 53 | db8 / data (`/var`, `/home`, cmn_data) / apps (`/media`) | ext4 rw | no | — | offline only; prefer file tars |
| boot0 / boot1 | eMMC hardware boot partitions (4 MB, `force_ro=1`; boot0 holds data) | — | — | — | capture; ISP restore |
| rpmb | 512 KB, authenticated | — | — | — | not possible |

Physically, the backup set sits **below** the active set, so the entries have been swapped an odd number of times since the factory.

SoC: LG in-house `M19A1` (`kdrv_lg1314`; lxboot tree `m16p3`) — not MediaTek. eMMC: Samsung.

## How the updater writes

Evidence: REA on `/usr/sbin/update` (unstripped, DWARF).

- **Writes go to the backup slot.** `SWUPDATE_FILE_UpdateSoftware` → `SWUPDATE_GetBackupPartition(name)`, falling back to in-place. It writes `/dev/mmcblk0` at the **physical offset** from partinfo, then reads back and memcmps (3 retries), and stores the CRC via `SWUPDATE_Partition_SetCrc32`.
- **Package signature.** `SWUPDATE_VerifyImage` checks RSA-2048 over SHA-256(SHA-256(payload)). The payload is AES-encrypted ("EPK V3 Secured", `encryption_key_type: prodkey`).
- **Post-write check.** `luna://com.webos.service.sm/verifyPartitions` (`partial` for USB updates).
- **The A/B flip.** `SWUPDATE_SwapDoublePartition`, for each doubled name:
  - sets the new entry `used=1, valid=2` and the old `used=0, valid=1`;
  - **memcpy-swaps the two 0x60-byte entries**, swaps their crc32info CRCs, and swaps `curEpk` / `oldEpk`;
  - `_SWUPDATE_WritePartitionInfoToFlash` writes the table to partinfo **and** mapbak.
  - There is no u-boot env slot flag: **the partinfo table is the flag.**
- **Revert.** `USBUPDATE_INTERFACE_RevertSWImage` does the same swap back to the old slot, but refuses without expert mode ("Expert Mode is not set - do not revert image").
- **Downgrade.** An older EPK only triggers an update in Expert or Commercial mode. Expert mode needs an authenticated Access USB, which downgr8 fakes on a rooted TV.
- **Large updates.** Staged to the appstore/cmn_data area. `SWUM` is written to p8, and lxboot boots swue to apply.
- **Runtime verification.** securitymanager's `sb_verify_task`:
  - on snapshot-resume boots, samples random 128 KB fragments of bsppart, rootfs, tvservice, otncabi, otycabi and license against RSA-signed SHA-256 values in the trailer;
  - on failure, sets the full-verify NVM flag and shuts down, so the next boot does a full lxboot verify;
  - no dm-verity.

## Recovery paths, ranked

1. **dd from the running rooted system.** *(verified mechanism — the updater does the same.)* Safe-ish on the inactive set (p36–45, p22, p7, p5) and offline data partitions. Requires webOS to boot and SSH to work.
2. **Revert to the backup slot (05.40.20).** *(verified in code.)* Needs expert mode (downgr8). lxboot also has a `backup` boot-mode command, but that needs a bootloader shell.
3. **USB EPK update from Settings.** *(verified in code.)* Newer versions work in user mode; same or older needs expert mode. Needs an LG-signed file and a booting UI.
4. **swue / emergency mode.** *(verified in code.)* `SWUM` in p8 makes lxboot start swue (EPK/PAK only; `swu [tftp|ser|mem]://` in lxboot). Arming it needs a booting system or bootloader shell. Whether swue picks up a USB EPK unattended is **unverified**.
5. **Homebrew Channel failsafe.** A crash during startup gives telnet only. Whether that still happens with `webosbrew_telnet_disabled` set is **unverified**. Only helps while kernel and rootfs boot.
6. **UART / lxboot shell.** The shell exists (prompt `lxboot-1st@M16P3 #`, with emmc, partinfo, swu, backup and emergency commands in p4), and the console is `ttyAMA0,115200`, but it's **locked**: `debugMode=5` = RELEASE *([NVM debugstatus gist](https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1))*. No B9 pinout found. Whether In-Start can set DEBUG on 4.5 is unconfirmed.
7. **Direct eMMC programming (ISP or chip-off).** Restores everything except RPMB. The only path for a TV that doesn't boot and isn't in DEBUG mode.

## Add to the backup

- Images keyed by **physical offset**, plus `/proc/partinfo` and the raw p2 / p3 / p9 as a matched trio.
- `mmcblk0boot0` and `mmcblk0boot1`.
- eMMC CID / CSD / ext_csd (`/sys/block/mmcblk0/device/`).
- `/proc/cmdline`, **private** (contains the serial and MAC; holds the ToolOpt / modelopt / hwopt values needed to rebuild NVM).
- The official signed EPKs for 05.40.45 and 05.40.20.
- A note of `curEpk` / `oldEpk` and which physical region is active.
- RPMB can't be captured. No anti-rollback counter was found in the updater, and the 05.40.20 slot remains revertible, so a rollback block looks like policy rather than cryptography *(inferred)*.

Sources: [downgr8](https://github.com/throwaway96/downgr8), [NVM debugstatus gist](https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1), [openlgtv Lxboot wiki](https://github-wiki-see.page/m/openlgtv/wiki/wiki/Lxboot).

## See also

- [research/notes/partitions.md](../research/notes/partitions.md): every partition on the eMMC, its mount, FS and whether it is read-only.
- [research/](../research/README.md): the research tools (EPK unpacking, custom-firmware prototype). The custom-fw installer writes `p48` and `p11` and is not safe to run without an eMMC programmer.
