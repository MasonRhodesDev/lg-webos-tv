# Snapshot boot — fast resume into a custom runtime

The LG B9 already boots from a kernel hibernation snapshot every cold start.
The snapshot partition (p48, "hib") is **not** in lxboot's RSA verification
table — the bootloader doesn't signature-check it. The idea was to write our
own snapshot so that every cold boot resumes into our trimmed runtime in a few
seconds. **That is ruled out** (see
[Custom snapshot: ruled out by design](#custom-snapshot-ruled-out-by-design)).
LG takes the snapshot before `/var` is mounted, and every service we trim
starts after the resume, so a custom image would match the stock one.

2026-10-26, read-only investigation.

## How it works today

### Boot path

```
Power on → lxboot (verifies kernel + 8 partitions — NOT p48)
  → kernel decompresses, starts (~3 s)
  → kernel checks resume=/dev/mmcblk0p48
  → finds valid signed swsusp image → restores pages from LZ4-compressed snapshot
  → userspace resumes where it was frozen
  → upstart snapshot-boot-sync, snapshot-boot-manager finish up
  → TV is live
```

The kernel cmdline (set by lxboot, not optional) always contains:

```
snapshot resume=/dev/mmcblk0p48 criu_enabled
```

### Current boot is a snapshot resume

`/sys/power/mode` reads `resume` on the running TV. The current session was
restored from p48, not cold-booted through the full upstart sequence. This is
true even with Quick Start+ set to `off` in the UI — the `snapshot` keyword in
the cmdline enables it unconditionally. The Quick Start+ toggle controls whether
a *new* snapshot is written on standby/shutdown, not whether the kernel resumes
from an existing one.

### The snapshot image

p48 ("hib") is 150 MB (`0x09600000`), at eMMC offset `0x89a80000`.

The first page is a standard Linux swsusp header:

| Offset | Content | Value |
|--------|---------|-------|
| 0x000 | Magic | `Linux\0` (6 bytes) |
| 0x040 | Hostname | `(none)` |
| 0x080 | Kernel version | `4.4.84-169.gld4tv.5` |
| 0x0C0 | Build string | `#1 SMP PREEMPT Wed Jul 3 16:55:54 KST 2024` |
| 0x100 | Architecture | `aarch64` |
| 0x180+ | Image metadata | Page counts, flags, etc. |

The kernel checks that the header's kernel version and build string match the
running kernel before resuming. A mismatched snapshot (wrong firmware version)
is rejected and the kernel falls through to a normal cold boot.

### Compression

`CONFIG_SNAPSHOT_IMAGE_COMPRESSION=y`, `CONFIG_SNAPSHOT_COMPRESS_TYPE="lz4"`.
`/sys/power/image_size` = 691,429,376 (660 MB target — the kernel tries to keep
the uncompressed image under this). With LZ4 compression, the on-disk image is
well under the 150 MB partition.

### Signing

`CONFIG_LG_SNAPSHOT_SECURE_BOOT=y` — the kernel verifies the snapshot signature
on resume.

`snapshot-boot-manager --make` (the userspace tool) creates the snapshot and
signs it. The signing flow, from strings in the binary:

```
1. dlopen("libsb.so")
2. dlsym → sb_sign_image_ex  (or sb_sign_snapshot_image)
3. Write snapshot via ioctl on /dev/lgsnap
4. Kernel hibernates to /dev/mmcblk0p48 (rawdev_snapshot_write)
5. Sign the image on p48 using hardware crypto (KADP_SE_SB*)
```

The `libsb.so` library wraps the M19A1's hardware security engine. The signing
key is in OTP fuses — but the hardware crypto is accessible from the normal
world (Linux root). `snapshot-boot-manager` runs as an ordinary root process
and signs successfully, proving root can sign.

The `not_used_sign` string in the binary (adjacent to the libsb calls) may be a
dummy function name for builds where signing is disabled. This could indicate a
bypass path, but has not been tested.

Relevant kernel symbols:

```
lgsnap_write_magic      — writes the swsusp magic header
rawdev_snapshot_write   — writes pages to the raw block device (p48)
swsusp_write            — kernel hibernate write path
swsusp_check            — kernel resume: reads and verifies the snapshot header
```

### Why p48 isn't behind the crypto wall

lxboot's 8-entry partition verification table (confirmed by Ghidra analysis of
the lxboot binary, see [custom-boot.md](custom-boot.md)):

```
[0] rootfs, [1] swue, [2] tzfw, [3] tvservice,
[4] otncabi, [5] otycabi, [6] bsppart, [7] license
```

p48 ("hib") is absent. lxboot does not RSA-verify it. The only verification is
the kernel's own resume path, which checks:

1. swsusp header magic and kernel version match
2. Snapshot signature via the `CONFIG_LG_SNAPSHOT_SECURE_BOOT` code path

Both checks use keys accessible from root (the same hardware crypto that
`snapshot-boot-manager --make` already calls).

## The two snapshot systems

The TV has two independent checkpoint mechanisms:

### 1. Kernel hibernation (swsusp → p48)

Full system snapshot: every process, every page of RAM, frozen and written to
the hib partition. On resume, the kernel restores all of it. This is what makes
cold boot fast.

- **Config**: `CONFIG_HIBERNATION=y`, `CONFIG_LG_SNAPSHOT_BOOT=y`
- **Trigger**: `snapshot-boot-manager --make` → writes to `/sys/power/mode`, opens `/dev/lgsnap`
- **Storage**: p48, raw block device, 150 MB
- **Scope**: entire system state

### 2. CRIU (userspace checkpoint → /tmp + eMMC)

Process-level checkpoint: CRIU freezes individual processes, dumps their memory
to files. Used for specific apps (home, inputcommon, fullhome) so they appear
instant after a snapshot resume.

- **Config**: `CONFIG_CHECKPOINT_RESTORE=y`, `criu_enabled` in cmdline
- **Binary**: `/usr/sbin/criu` v1.7.2, runs as a service (`criu.conf`)
- **Storage**: `/tmp/checkpoint/` (tmpfs) + `/mnt/lg/cmn_data/checkpoint/` (eMMC)
- **Scope**: individual processes

For our purposes, the kernel hibernation is what matters. CRIU is an optional
layer on top for app-level restore.

## Snapshot creation flow

### Stock "making" boot

LG triggers snapshot creation via a special boot mode:

1. Something writes `making` or `snap_making` to `/sys/power/mode`
   (likely triggered by tvservice's `API_DASY_Hibernate` / `DIL_VBE_DISP_OLED_setQuickStartMode`)
2. The system boots only as far as the snapshot components: tvservice, the
   compositor windows, configd and home (`/etc/snapshot/snap_list`).
   `/var` is not mounted yet and `bootd` has not started.
3. `snapshot-boot-manager --make` is called (from `snapshot-boot-manager.conf`,
   which waits on `tvwin-sync and mvpdwin-sync and configd-sync`)
4. `--make` writes `snap_making` to `/sys/power/mode`
5. The kernel hibernates to p48, `libsb.so` signs the image
6. TV reboots
7. Next boot: kernel finds a valid signed snapshot → resumes

On every boot, resumed or cold, the same job emits `snapshot-resume-done` only
after `--make`. Everything else in the boot hangs off that event (see below).

### Prerequisites for `--make`

From the binary strings:

- `tvservice` must be running: `"can't lookup tvservice, so don't make snapshot image"`
- `/sys/power/mode` must be readable
- `/dev/lgsnap` must be openable
- `libsb.so` must be loadable (it's in bsppart, always present)

### Upstart integration

`SetInitEnv.conf` exports the `SBM` variable to all jobs:

```sh
SBM="SNAP_FLOCK=/tmp/snapshot_flock \
  IS_SNAP=$(if grep -q -w 'snapshot' /proc/cmdline; then echo 'YES'; else echo 'NO'; fi) \
  RWMOUNT_FLAG=/tmp/mount-readwrite.conf.done"
```

Jobs that participate in the snapshot emit `snapshot-component-ready` (home,
fullhome, inputcommon, configd, surface-manager, WebAppMgr). The
`snapshot-boot-sync.conf` waits for `ls-hubd_public-ready` and then calls
`snapshot-boot-manager -d` to resume all components. After all syncs complete,
`snapshot-boot-manager.conf` calls `--make` if in making mode.

`criu_copy_img.conf`: when in `making` mode, clears all existing CRIU images
before creating new ones.

## Custom snapshot: ruled out by design

2026-10-26, read-only. The goal was a snapshot with our trimmed runtime
inside it, so that a cold boot resumes straight into that runtime in under
5 s. That can't work on this firmware. The obstacle is how LG built the boot,
not when our code runs.

### The snapshot is taken before `/var` exists

The upstart order on the TV:

```
snapshot-boot-sync      start on ls-hubd_public-ready → emits tvwin/mvpdwin/configd-sync
snapshot-boot-manager   start on tvwin-sync and mvpdwin-sync and configd-sync
                        → runs --make (making boot only), THEN emits snapshot-resume-done
mount-readwrite         start on snapshot-resume-done   → mounts /var (p52), cmn_data, db8, apps
bootd                   start on (stopped mount-readwrite or mount-readwrite-done)
                        → emits init-boot-done, core-boot-done, minimal-boot-done,
                          boot-done, rest-boot-done
devmode                 start on minimal-boot-done → HBC startup.sh → init.d/50-custom-runtime
```

So the image contains only what is alive before `mount-readwrite`. That is
`/`, `/mnt/lg/tvservice` and `/old_root` (`/etc/snapshot/fs_list`), plus the
tvservice, tvwin, configd and home components (`snap_list`,
`process_list`). All of these are on the `services_never_stop` list. Every
service the overlay stops is started by `bootd` after the resume:

| Starts on | Services |
|---|---|
| `minimal-boot-done` | rdxd, contentminer, update, voiceconductor, securitymanager |
| `boot-done` | uploadd, dpp, aiservice, airplay-adaptor, miracast |
| `core-boot-done` | certupdmgr_timer, voiceinput, btaudiosrc, bluetoothdrv-mtk → asc |
| `init-boot-done` | btaudiosnk |
| `rest-boot-done` | dmr, ssdp-discovery-lgtv |
| `started rdxd` | crashreportd |
| `stopped mknod` (early) | remotelogger, the only one alive at snapshot time |

A "trimmed" snapshot would therefore match the stock one. The roughly 35 s
cascade runs after every resume either way, and so does HBC, which lives on
`/var`.

### Our code can't run before the snapshot point

- `/etc/init` is on the read-only rootfs overlay
  (`overlay / ro lowerdir=/mnt/bsppart/bsp:/`, with no upper layer). lxboot
  RSA-verifies both layers. A new `custom-pre-snapshot.conf` or an edited
  `snapshot-boot-manager.conf` can't persist. A runtime bind mount over a
  `.conf` disappears at the cold boot that would be the making boot.
- HBC's hook needs `/var`, which is mounted only after the snapshot.

### A late snapshot would corrupt `/var`

The other approach is to call `--make` by hand after the overlay has run.
LG blocks this on purpose: `snapshot-boot-sync.conf` checks `RWMOUNT_FLAG`
("After rwmounting, do not make snapshot image"). The image is reused on every
boot. If it held a read-write ext4 mount of p52, each resume would bring back
stale in-memory filesystem state on top of a disk that kept changing. That
corrupts `/var`, and `/var` holds HBC and root access.

**Do not run `snapshot-boot-manager --make`, `-x` or `--remove`.** Removing
the stock image only helps with a making boot, and nothing we control can run
early enough in one. Making an image after `/var` is mounted is the corruption
case above.

### What still applies

The signing analysis and "Why p48 isn't behind the crypto wall" above are
still accurate. A snapshot shortens only the stage before `mount-readwrite`,
and that stage holds nothing we want to remove. The ways left to cut boot time:

- Shorten the post-resume cascade so HBC fires earlier. This is constrained by
  the same read-only `/etc/init`.
- [Path C kexec](path-c-kexec.md).
- Keep the init.d overlay at about 35 s, which works today.

## Evidence

All findings from read-only SSH commands on the running TV. Key commands:

```sh
# Partition table
cat /proc/partinfo

# Current boot mode
cat /sys/power/mode          # → "resume" (this IS a snapshot boot)

# Snapshot header
dd if=/dev/mmcblk0p48 bs=4096 count=1 | strings -n 6

# Kernel config
zcat /proc/config.gz | grep -E 'SNAPSHOT|HIBERNATE|CRIU|LG_SNAP'

# Signing functions
strings -n 6 /usr/sbin/snapshot-boot-manager | grep -i sign
strings -n 6 /usr/lib/libsb.so | grep -i 'sign\|snapshot'

# Kernel symbols
grep -E 'lgsnap|rawdev_snapshot|swsusp' /proc/kallsyms

# Upstart configs
cat /etc/init/snapshot-boot-manager.conf
cat /etc/init/criu.conf
cat /etc/init/snapshot-boot-sync.conf

# CRIU
/usr/sbin/criu --version     # 1.7.2

# Quick Start+ setting
luna-send -n 1 -f luna://com.webos.service.settings/getSystemSettings \
  '{"category":"option","keys":["quickStartMode"]}'
```

## Related docs

- [custom-boot.md](custom-boot.md) — lxboot verification analysis, all boot paths
- [path-b-late-overlay.md](path-b-late-overlay.md) — the runtime overlay that would be snapshotted
- [path-c-kexec.md](path-c-kexec.md) — full custom OS via kexec (different goal: control, not speed)
- [startup.md](startup.md) — upstart job inventory and boot timeline
