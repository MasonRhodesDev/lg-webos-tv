# Backup & restore

How to take a complete read-only backup of the TV, check it, and put things back at each level. Partition roles and the A/B rules come from [recovery.md](recovery.md); read that first.

**No restore step on this page has been tested.** The backup was taken without writing anything to the TV, so every restore below is *untested* and derived from the updater's own behaviour ([recovery.md](recovery.md)) and general Linux practice.

## Taking a backup

```sh
cp .env.example .env            # set TV_HOST (TV_USER defaults to root)
scripts/backup.sh /path/outside/the/repo/YYYY-MM-DD
# or individual phases, in this order:
scripts/backup.sh DIR runtime settings files images manifest
```

The output holds secrets: serial number, NDUID, MAC addresses, Wi-Fi PSK, account tokens, LG voice keys and SSH keys. It goes in a `chmod 700` directory outside any git repo and never leaves the machine.

How the script behaves:

- **Read-only on the TV.** Every remote command reads and streams its output to stdout. Nothing is mounted, written (not even to `/tmp`), started or stopped.
- **Hashed end to end.** Each stream is hashed on the TV in the same pass (`tee` into `sha256sum`, or `md5sum` if that's all the TV has) and again locally. The two hashes are compared.
- **Bounded load.** Block reads run under `nice -n 19 ionice -c 2 -n 7`, one at a time, with a pause between them.
  - Before each read it checks that the TV still answers and that its 1-min load is under `MAX_LOAD` (default 16).
  - It also waits until no other `dd` of the eMMC is running.
  - If any check fails, it stops. It does not retry.
- **Re-runnable.** Items that already exist and verify are skipped. `FORCE=1` re-captures them.
- **Interrupt with care.** Busybox `tee` ignores SIGPIPE. If the local side dies mid-read, the TV keeps reading to the end of that device. Each read is therefore wrapped in a TV-side `timeout` sized for about 2 MB/s.
- **Borrowed appIds.** db8 refuses anonymous reads of the settings kinds. The settings dump borrows the settings service's appId (`luna-send -a`) for read-only `find` calls only, and logs each use in `backup.log`. The script refuses a borrowed appId for any method that isn't a read.
- **Manual root overlay.** If someone has mounted an rw overlay on `/` by hand, it hides the data and db8 mounts and the ramfs logs.
  - Logs are then read through a daemon's working directory (`/proc/<pid>/cwd/..`).
  - The hidden filesystems are covered only by their partition images. The `files` phase notes this.
  - A backup after a clean boot gets them as file tars too.

## What's in it

| Path | Content | Verified by |
|---|---|---|
| `runtime/` | `/proc/{mounts,self/mountinfo,cmdline,partitions,partinfo}`, sysfs partition offsets and write counters, eMMC CID/CSD, `uname`, `lsmod`, `initctl list`, `ps` with args, `netstat -ltun`, addresses, `starfish-release`, `bootd.log`, `messages`, a tar of the log dir and `/var/run/nyx`, and `ls -lnR` of `/etc/init`, `/etc/configd`, `/var/luna/preferences`, `/home`, `/media/developer` | TV-side sha256 |
| `settings/` | `getSystemSettings` for every category in `/etc/palm/description.categorykeysmap.json` (category-only and explicit-keys forms); a db8 dump of `com.webos.settings.{system,default,desc.system}` (all input/picture dimensions); preload policy; configd values (`<namespace>.*` for every layer file); system info; eim inputs; Bluetooth adapter and devices; connman; Wi-Fi profiles; app list and launch points | luna output (no TV-side file). The settings map itself is TV-hashed |
| `files/` | GNU tar `-p --numeric-owner --one-file-system` of `/var`, `/home`, `/media/developer`, the whole data partition (`/mnt/lg/cmn_data`), db8 (`/mnt/lg/db8`), `uhdcp`, CI+ `authcxt`, and `/etc` as seen live (with its bind mounts) | TV-side sha256 |
| `images/sSSSSSSSS_mmcblk0pN.img` | raw image of each partition, named by **physical start sector** (512-byte sectors) | TV-side sha256, size = sysfs size × 512, write counter before/after |
| `images/gap_*.img` | unpartitioned space (one 256 KiB gap between `wossestore` and the lower kernel slot) | TV-side sha256 |
| `images/mmcblk0_{head,tail}_8MiB.img` | first and last 8 MiB of the whole device | TV-side sha256 |
| `images/mmcblk0boot{0,1}.img` | eMMC hardware boot partitions | TV-side sha256 |
| `images/proc_partinfo.{before,after}.txt`, `partinfo_trio.txt` | `/proc/partinfo` around the p2/p3/p9 reads, and whether they form a matched trio | compared locally |
| `images/partition_table.tsv` | name, start sector, size in sectors, plus the whole disk | — |
| `MANIFEST.txt` | size, local sha256, TV match (`yes` / `n/a` / `NO`) and note for every file | — |

There is no GPT or MBR. Kernel `pN` is LG partinfo index N, p1 starts at sector 0, and p53 runs to the end of the device. Together, the images and the gap files cover every byte of `mmcblk0`.

### Not covered

- **RPMB** (512 KiB authenticated area) was deliberately skipped (owner decision, 2026-10-25). It could be read with `mmc-utils` uploaded to `/tmp`, but writes need a key held in TrustZone, so a copy could never be restored; it would only be a reference.
- **ext_csd** is captured as `boot2/runtime/emmc_ext_csd.hex` (512 bytes, hash-matched on the TV). debugfs was mounted just long enough to read it, then unmounted. Key fields: EXT_CSD_REV 8, `PARTITION_CONFIG` 0x00 (the boot partitions are **not** enabled for boot; lxboot loads from the user area), `BOOT_WP` 0, `RST_n` 0, `PARTITION_SETTING_COMPLETED` 0 (no enhanced or general-purpose partitions), `BOOT_SIZE_MULT` 32 (4 MiB each), `RPMB_SIZE_MULT` 4 (512 KiB), `SEC_COUNT` 15269888. For an ISP restore or a chip swap, a factory-default chip only needs the user area written. CID and CSD are captured too.
- **Signed USB EPK files** for the current and backup-slot firmware. They have to be downloaded separately; see [recovery.md](recovery.md).
- **Live state:** tmpfs and ramfs content (except the logs), the CRIU snapshot's in-memory state, and app state held only in memory.

### Consistency of rw partitions

p15, p46, p51, p52 and p53 are mounted rw while they're imaged. For each one the script records the kernel's sectors-written counter (`/sys/block/mmcblk0/mmcblk0pN/stat`, field 7) before and after the read.

- **Unchanged counter:** the image is a crash-consistent point-in-time copy. ext4 replays its journal on first mount, as after a power cut.
- **Changed counter:** the image is marked `INCONSISTENT` in `MANIFEST.txt`. Partitions up to 1 GiB are retried (`RW_RETRIES`). For `/media`, a full `files/media.tar` is taken instead.
- **Prefer the file tars** for p51, p52 and p53 when restoring individual files.

### Backups spanning two boots

One backup directory can hold several boots (`boot1/`, `boot2/`, ...), each with its own `MANIFEST.txt`. A combined `MANIFEST.txt` at the top prefixes each path with its boot, so the verify commands below work from either level. Never pair a partition image from one boot with a file tar from another as if they were one state. The `README` at the top of the backup directory says which boot each part came from.

## Verifying

```sh
cd BACKUP/bootN
# 1. local integrity: every file still matches the manifest
awk '!/^#/ {print $2 "  " $4}' MANIFEST.txt | sha256sum -c --quiet
# 2. nothing failed the TV-side comparison
grep -c '  NO  ' MANIFEST.txt          # expect 0
grep INCONSISTENT MANIFEST.txt          # rw images that changed during the read
cat images/partinfo_trio.txt            # expect "matched"
# 3. against the TV now (read-only; also shows what changed since)
S=00214016; N=1703424                   # start/size from images/partition_table.tsv
ssh root@"$TV_HOST" "dd if=/dev/mmcblk0 bs=512 skip=$((10#$S)) count=$N 2>/dev/null | sha256sum"
```

Check whether an image still matches its partition number. After an A/B flip, `pN` moves:

```sh
grep -P '^mmcblk0p28\t' images/partition_table.tsv
ssh root@"$TV_HOST" cat /sys/block/mmcblk0/mmcblk0p28/start
```

## Restoring

Tested: none. Every step below is **untested**. Steps lower down are riskier.

### 1. Settings (untested, low risk)

- **Writing back.** `com.webos.settingsservice/setSystemSettings` is the counterpart of `getSystemSettings`:

  ```sh
  ssh -tt root@"$TV_HOST" "luna-send -n 1 luna://com.webos.settingsservice/setSystemSettings \
    '{\"category\":\"option\",\"settings\":{\"livePlus\":\"off\"}}'"
  ```

- **Get the values** from `settings/system/category_<cat>.json` (`.settings`).
- **Restore keys one at a time** rather than a whole category. Some keys are read-only or trigger actions (factory, EULA, network, `hotelMode`, `commercial`).
- **Per-input picture and sound values** (one per dimension) are in the db8 dump. `setSystemSettings` takes a `dimension` object for those (untested).
- **Don't write db8 directly** with `put` or `merge`. Use the settings service.
- configd values come from read-only layers in the rootfs. They aren't user state and don't need a restore.

### 2. Files under /var, /home, /media (untested, low–medium risk)

1. Extract locally, then stream single files back. Keep ownership and permissions from the tar listing:
   ```sh
   tar -xpf files/var.tar --numeric-owner -C /tmp/restore var/luna/preferences/<file>
   ssh root@"$TV_HOST" 'cat > /var/luna/preferences/<file>' < /tmp/restore/var/luna/preferences/<file>
   ssh root@"$TV_HOST" 'chown 0:0 /var/luna/preferences/<file>; chmod 644 /var/luna/preferences/<file>'
   ```
2. Reboot with `sync; reboot` in the foreground ([startup.md](startup.md)) so services reread their state.

- **Don't untar over a live `/var` or `/mnt/lg/cmn_data`.** Running services hold db8, caches and prefs open and will overwrite or corrupt them.
- **For a whole-filesystem rollback, use the partition image** (level 3, offline only).
- **`webosbrew_*` flags** in `/var/luna/preferences` change what Homebrew Channel does at boot: telnet, failsafe, update blocking. Restore them knowingly.

### 3. One partition image with dd (untested, risk depends on the partition)

**Restore by physical offset, never by `pN`.** An update or revert swaps the partinfo entries, so `pN` can point at the other A/B region after a flip ([recovery.md](recovery.md)). The image filename carries its start sector.

```sh
IMG=images/s00214016_mmcblk0p38.img
S=$((10#$(basename "$IMG" | sed 's/^s\([0-9]*\)_.*/\1/')))
N=$(( $(stat -c %s "$IMG") / 512 ))
# 1. Confirm the target region today holds what you think (same name in /proc/partinfo at this offset).
# 2. Confirm nothing has it mounted:  ssh ... "grep -c mmcblk0pN /proc/mounts"   -> 0
# 3. Write, flush, read back:
ssh root@"$TV_HOST" "dd of=/dev/mmcblk0 bs=512 seek=$S count=$N conv=fsync" < "$IMG"
ssh root@"$TV_HOST" "dd if=/dev/mmcblk0 bs=512 skip=$S count=$N 2>/dev/null | sha256sum"   # must equal MANIFEST
```

Rules:

- **The target must be unmounted and unused.** For the rw data partitions (p51, p52, p53, p15, p46), that isn't possible while webOS runs normally. It needs a recovery state that doesn't mount them, or ISP.
  - Writing a mounted ext4 under the kernel corrupts it.
  - Restoring p52 also rolls back `/var/luna/preferences`, including the Homebrew Channel flags and the SSH key.
- **Write back byte-identical images only.** Signed images (kernel, rootfs set, lxboot) verify because their trailer travels with the bytes. Partial or mismatched data in a signed partition fails verification at boot. That can brick the TV, or trigger securitymanager's full-verify shutdown on the next resume.
- **Restore p2 (partinfo), p3 (mapbak) and p9 (crc32info) together**, from the same backup, and only if `partinfo_trio.txt` says `matched`. Partinfo **is** the A/B flag. Restoring it without the slot contents it describes boots the wrong or an empty slot.
- **Don't restore p48 (hib).** It is the CRIU snapshot and is regenerated. An old one doesn't match the current system.

| Partitions (by role) | Restore from a live system |
|---|---|
| inactive slot set (backup rootfs, tvservice, bsppart, otncabi, otycabi, fonts, tzfw, license; inactive kernel, swue, hwsetting/pmsfw copies) | possible: this is what the updater does. Safe-ish, untested |
| p25–27 logo / hwsetting / pmsfw, p49 dump, p50 hist | possible, untested |
| p15 authcxt, p46 uhdcp, p51 db8, p52 data, p53 apps | **offline only** (unmounted); prefer file tars |
| p2 / p3 / p9 partinfo, mapbak, crc32info | **dangerous:** only as a trio, only this TV's own copy |
| **p1 secureboot, p4 lxboot (in use), p8 emergency** | **never live:** brick risk, or (p8) forces swue mode |
| **active slot set** (the region `root=` and `/proc/partinfo` point at now) | **never live:** writing the running rootfs crashes the TV |
| **device secrets** p10–14, p16–20, p23/24 sedata | this TV's own copy only, never swapped between slots or TVs |
| boot0 / boot1 | ISP only |
| RPMB | not possible |

### 4. Whole device (untested)

Without a working webOS, the only full restore is direct eMMC programming (ISP or chip-off). Write each `images/s*.img` at its sector offset and each `gap_*` at its offset, or concatenate them in offset order into one 7.3 GB image. Do the same for `mmcblk0boot0` and `mmcblk0boot1`. RPMB stays as it is on the chip. See [recovery.md](recovery.md) for the other recovery paths, from slot revert to USB EPK and swue.
