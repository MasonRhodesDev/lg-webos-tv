# Component A3 — Partition inventory & writability

**Target:** LG B9 OLED55B9PUA, fw 05.40.45 (M19_ATSC), <tv-address>.
**Method:** one read-only SSH session, 2026-11-04. Raw outputs in `b9-raw/a3-parts/a3-session.txt`.
**Active slot this boot:** root=`/dev/mmcblk0p28` (slot A). Backup slot: p38–p45.
**No MTD.** `/proc/mtd` is absent — storage is pure eMMC (`mmcblk0`, 7.46 GiB + two 4 MiB boot partitions + RPMB).
**No dm-verity.** `/sys/block` has no `dm-*` devices; `/proc/mounts` has no dm nodes. Rootfs integrity is enforced by lxboot `sb_verify_image` *before* mount, plus securitymanager `sb_verify_task` sampling at runtime (see docs/recovery.md). Overlay `/` has `lowerdir=/mnt/bsppart/bsp:/` — bsppart stacked on top of squashfs rootfs; no `upperdir`, so the overlay itself is read-only.

## 1. Full partition table

Offsets in hex bytes from `/proc/partinfo`; sizes converted to MiB. Mount from `/proc/mounts`; fs from mount output. Backing device is `/dev/mmcblk0pN` for every logical partition (no GPT; no by-name links).

| p  | Name        | Offset        | Size      | Dev          | Mount(s)                                                                 | FS       | Notes |
|----|-------------|---------------|-----------|--------------|--------------------------------------------------------------------------|----------|-------|
| 1  | secureboot  | 0x00000000    | 1.00 MiB  | p1           | —                                                                        | raw      | 1st-stage, RSA; shadow-ROM covered |
| 2  | partinfo    | 0x00100000    | 256 KiB   | p2           | —                                                                        | raw table| A/B flag (partinfo table itself) |
| 3  | mapbak      | 0x00140000    | 256 KiB   | p3           | —                                                                        | raw table| mirror of p2 |
| 4  | boot (A)    | 0x00380000    | 2.00 MiB  | p4           | —                                                                        | raw      | **lxboot (active)** |
| 5  | boot (B)    | 0x00180000    | 2.00 MiB  | p5           | —                                                                        | raw      | lxboot backup slot (empty per recovery.md) |
| 6  | swue (A)    | 0x00580000    | 20.0 MiB  | p6           | —                                                                        | raw      | updater mini-OS, active |
| 7  | swue (B)    | 0x01980000    | 20.0 MiB  | p7           | —                                                                        | raw      | updater mini-OS, inactive |
| 8  | emergency   | 0x02d80000    | 256 KiB   | p8           | —                                                                        | raw      | `SWUM` magic triggers swue boot |
| 9  | crc32info   | 0x02dc0000    | 256 KiB   | p9           | —                                                                        | raw table| per-partition CRCs (swapped with p2) |
| 10 | macadr      | 0x02e00000    | 256 KiB   | p10          | —                                                                        | raw      | device-secret |
| 11 | env_nvm     | 0x02e40000    | 256 KiB   | p11          | —                                                                        | raw      | NVM/debugMode; read-only from Linux side |
| 12 | widevine    | 0x02e80000    | 512 KiB   | p12          | —                                                                        | raw      | DRM key blob |
| 13 | idfile      | 0x02f00000    | 512 KiB   | p13          | —                                                                        | raw      | device ID |
| 14 | cert        | 0x02f80000    | 512 KiB   | p14          | —                                                                        | raw      | certs |
| 15 | authcxt     | 0x03000000    | 6.00 MiB  | p15          | /mnt/lg/ciplus/authcxt                                                   | ext4 rw  | CI+ auth ctx |
| 16 | nvram       | 0x03600000    | 8.00 MiB  | p16          | —                                                                        | raw      | NVRAM blobs |
| 17 | marlin      | 0x03e00000    | 256 KiB   | p17          | —                                                                        | raw      | DRM |
| 18 | xcas        | 0x03e40000    | 4.00 MiB  | p18          | —                                                                        | raw      | CAS |
| 19 | sestore     | 0x04240000    | 512 KiB   | p19 (grp se) | —                                                                        | raw      | secure store (`root:se`, g+rw) |
| 20 | wossestore  | 0x042c0000    | 1.00 MiB  | p20 (grp se) | —                                                                        | raw      | WebOS secure store |
| 21 | kernel (A)  | 0x05400000    | 16.0 MiB  | p21          | —                                                                        | raw image| **active kernel**, lxboot-verified |
| 22 | kernel (B)  | 0x04400000    | 16.0 MiB  | p22          | —                                                                        | raw image| inactive kernel |
| 23 | sedata (A)  | 0x06400000    | 512 KiB   | p23 (grp se) | —                                                                        | raw      | OTP-bound keys |
| 24 | sedata (B)  | 0x06480000    | 512 KiB   | p24          | —                                                                        | raw      | sedata backup |
| 25 | logo        | 0x06500000    | 512 KiB   | p25          | —                                                                        | raw      | splash logo |
| 26 | hwsetting   | 0x06580000    | 2.00 MiB  | p26          | —                                                                        | raw      | hw setting, A |
| 27 | pmsfw       | 0x06780000    | 1.00 MiB  | p27          | —                                                                        | raw image| panel/pmic firmware, A |
| 28 | rootfs (A)  | 0x48040000    | 831 MiB   | p28          | `/old_root`, `/` (via overlay lowerdir)                                  | squashfs ro | **active rootfs**, lxboot sb_verify_image |
| 29 | tvservice(A)| 0x7c000000    | 61.75 MiB | p29          | /mnt/tvservice, /mnt/lg/tvservice, various jail subpaths                 | squashfs ro | sampled by sb_verify_task |
| 30 | bsppart (A) | 0x7fdc0000    | 27.75 MiB | p30          | /old_root/mnt/bsppart (→ overlay lowerdir for /)                         | squashfs ro | sampled by sb_verify_task |
| 31 | otncabi (A) | 0x81980000    | 32.50 MiB | p31          | /mnt/otncabi + jail                                                      | squashfs ro | sampled |
| 32 | otycabi (A) | 0x83a00000    | 1.00 MiB  | p32          | /mnt/otycabi, /usr/lib/nyx/modules                                       | squashfs ro | sampled |
| 33 | fonts (A)   | 0x83b00000    | 86.00 MiB | p33          | /mnt/fonts, /usr/share/fonts, several jail subpaths                      | squashfs ro | — |
| 34 | tzfw (A)    | 0x89100000    | 2.00 MiB  | p34          | —                                                                        | raw image| TrustZone fw, active |
| 35 | license (A) | 0x89300000    | 2.00 MiB  | p35          | /mnt/license                                                             | squashfs ro | sampled |
| 36 | hwsetting(B)| 0x47d40000    | 2.00 MiB  | p36          | —                                                                        | raw      | backup of p26 |
| 37 | pmsfw (B)   | 0x47f40000    | 1.00 MiB  | p37          | —                                                                        | raw      | backup of p27 |
| 38 | rootfs (B)  | 0x06880000    | 831 MiB   | p38          | —                                                                        | squashfs (unmounted) | **backup slot rootfs** |
| 39 | tvservice(B)| 0x3a840000    | 61.75 MiB | p39          | —                                                                        | squashfs (unmounted) | backup |
| 40 | bsppart (B) | 0x3e600000    | 27.75 MiB | p40          | —                                                                        | squashfs (unmounted) | backup |
| 41 | otncabi (B) | 0x401c0000    | 32.50 MiB | p41          | —                                                                        | squashfs (unmounted) | backup |
| 42 | otycabi (B) | 0x42240000    | 1.00 MiB  | p42          | —                                                                        | squashfs (unmounted) | backup |
| 43 | fonts (B)   | 0x42340000    | 86.00 MiB | p43          | —                                                                        | squashfs (unmounted) | backup |
| 44 | tzfw (B)    | 0x47940000    | 2.00 MiB  | p44          | —                                                                        | raw image| backup TZ |
| 45 | license (B) | 0x47b40000    | 2.00 MiB  | p45          | —                                                                        | squashfs (unmounted) | backup |
| 46 | uhdcp       | 0x89500000    | 5.00 MiB  | p46          | /mnt/lg/uhdcp                                                            | ext4 rw  | HDCP state |
| 47 | profdata    | 0x89a00000    | 512 KiB   | p47          | —                                                                        | raw/ext? | unmounted |
| 48 | hib         | 0x89a80000    | 150 MiB   | p48          | — (`resume=/dev/mmcblk0p48` in cmdline)                                   | raw image| CRIU snapshot; sb_sign_snapshot_image at creation |
| 49 | dump        | 0x93080000    | 10.0 MiB  | p49          | —                                                                        | raw      | crash dumps (`mmcoops=dump`) |
| 50 | hist        | 0x93a80000    | 512 KiB   | p50          | —                                                                        | raw      | history |
| 51 | db8         | 0x93b00000    | 112 MiB   | p51          | /mnt/lg/db8, /var/db                                                     | ext4 rw  | settings DB |
| 52 | data        | 0x9ab00000    | 550 MiB   | p52          | /var, /home, /mnt/lg/{cmn_data,flash/data,user,cache/{flash,sdp,browser,webbrowser}}, bind over /etc/passwd | ext4 rw | user state |
| 53 | apps        | 0xbd100000    | 4.32 GiB  | p53          | /mnt/lg/appstore, /media                                                 | ext4 rw  | apps + HBC install (`/media/developer`) |
| —  | boot0       | eMMC BOOT1 LUN| 4.00 MiB  | mmcblk0boot0 | —                                                                        | raw      | holds data; `force_ro=1` live |
| —  | boot1       | eMMC BOOT2 LUN| 4.00 MiB  | mmcblk0boot1 | —                                                                        | raw      | empty; `force_ro=1` live |
| —  | rpmb        | RPMB LUN      | 512 KiB   | mmcblk0rpmb  | —                                                                        | authenticated | not readable without key |

zram0 (600 MiB virtual, swap) and loop0 (igallery squashfs mounted off p53) are not physical partitions.

## 2. Writability matrix

Classification per partition. Where mode bits allow it and the device is not held by a mounted fs, `dd` from the running system would succeed; `force_ro` on the eMMC HW boot partitions blocks writes without a `force_ro 0` first (none of my calls wrote; this is inferred from file modes and fs state).

- **Mounted rw (ext4, writable in place):**
  - p15 /mnt/lg/ciplus/authcxt
  - p46 /mnt/lg/uhdcp
  - p51 /mnt/lg/db8 (+ /var/db)
  - p52 /var, /home, /mnt/lg/{cmn_data,flash/data,user,cache/...}, bind over /etc/passwd
  - p53 /mnt/lg/appstore, /media (HBC)
- **Mounted ro (squashfs — cannot be modified in place; can be dd-overwritten offline, but writing while live crashes the TV per docs/recovery.md):**
  - p28 rootfs(A) — the active rootfs; overlay above it is also ro (no upperdir).
  - p29, p30, p31, p32, p33, p35 (tvservice/bsppart/otncabi/otycabi/fonts/license, active A set).
- **Raw & unmounted — writable from root at the block device:**
  - Backup slot: p38 rootfs(B), p39 tvservice(B), p40 bsppart(B), p41 otncabi(B), p42 otycabi(B), p43 fonts(B), p45 license(B).
  - Inactive kernel: p22. Active kernel p21 is also raw (no FS; ro by mode but the writer `update` process can dd to it — doing so live is a brick per docs/recovery.md).
  - Backup logo/hw/pms: p25, p26, p27, p36, p37. Backup TZ: p34, p44.
  - swue: p6 (active), p7 (backup). Emergency: p8.
  - partinfo trio: p2, p3, p9 (writable only in matched trio).
  - Secrets: p10 (macadr), p11 (env_nvm), p12 (widevine), p13 (idfile), p14 (cert), p16 (nvram), p17 (marlin), p18 (xcas), p19 sestore, p20 wossestore, p23/24 sedata — technically writable as root (p19/20/23 need se group but root ignores g-bit anyway), but device-bound and never restorable from another TV.
  - Crash/scratch: p47 profdata, p48 hib, p49 dump, p50 hist.
  - Boot stage 1: p1 secureboot — writable only via ISP per docs/recovery.md; from Linux the shadow-ROM copy is what runs.
  - p4 lxboot active, p5 lxboot backup — raw, writable, brick-risk.
- **HW-gated:**
  - mmcblk0boot0 / boot1 — `force_ro=1`; must `echo 0 > force_ro` before any write.
  - mmcblk0rpmb — authenticated writes only; key unknown.
- **dm-verity:** none — confirmed by empty `/sys/block/dm-*` and absent from `/proc/mounts`.

## 3. Boot-verify status

Primary source: lxboot RE from **Component A1 is not yet filed** (`scratchpad/grey-hat/b9-component-a1-lxboot.md` does not exist). docs/recovery.md gives partial coverage from an earlier pass:

Known (from docs/recovery.md, verified in the updater & securitymanager RE already done):
- **Lxboot verifies at boot**: p21 kernel (sb_verify_image), active rootfs p28 (+ trailer at fileSize-0x2110), and by extension the "active set" (p28–p35). Lxboot falls back to mapbak p3 if partinfo p2 is corrupt.
- **securitymanager `sb_verify_task` samples at runtime (snapshot-resume path)**: bsppart, rootfs, tvservice, otncabi, otycabi, license — RSA-SHA256 trailers. On failure sets full-verify NVM flag; next boot does a full lxboot verify.
- **Package signatures**: `SWUPDATE_VerifyImage` (RSA-2048, SHA-256²) blocks EPK installs that don't verify. Not a boot check per se, but it's why planting a modified image in the backup slot without a sig doesn't survive a slot swap.

**UNKNOWN pending A1** — questions to answer from lxboot RE:
1. Does lxboot verify a signature on p48 `hib` before CRIU resume? `sb_sign_snapshot_image` is called at snapshot *creation*; whether the resume path calls `sb_verify_image` on it, or whether the kernel trusts the resume blob blindly, is the single biggest unknown for persistence.
2. Does lxboot (or any pre-kernel stage) checksum or sanity-check p25 logo, p26/p36 hwsetting, p27/p37 pmsfw, or p34/p44 tzfw? These are raw, writable, and if unverified they are persistence slots for either a cosmetic payload (logo) or something more interesting (pmsfw is panel firmware, tzfw is TrustZone — TZ **must** be verified; confirm the chain).
3. Does lxboot ever read from p52 or p53 before the kernel hands off to userland? (Expected: no. If it does, the factory-reset-survival reasoning changes.) A1 should confirm from the lxboot filesystem/FS-driver list.
4. Does lxboot verify the inactive kernel p22 at any point outside the swap path?
5. The full list of partitions covered by `sb_verify_task`'s **full-verify** mode (as opposed to the sampled snapshot-resume mode). docs/recovery.md names 5; the full list likely covers all 8 of the active set (p28–p35). Confirm p30 bsppart and p34 tzfw explicitly.
6. The `verifyPartitions` luna call's "partial" vs full partition list.

## 4. Overlay / bind-mount layer

- **Active rootfs is `/dev/mmcblk0p28` squashfs**, mounted once at `/old_root` and again as the `lowerdir` of the overlay at `/`. The overlay stacks `/mnt/bsppart/bsp/` on top (also squashfs, `/dev/mmcblk0p30`). The overlay has **no upperdir** → `/` is read-only for user writes; every file change goes to a bind-mounted writable backend.
- **`/etc/passwd` is a tmpfs bind initially** (one view in mount), then re-bound from `/dev/mmcblk0p52` ext4 rw (`/dev/mmcblk0p52 on /etc/passwd type ext4 ...`) — so the on-disk persistent `/etc/passwd` lives inside p52. Changing it survives reboot but does **not** survive factory reset.
- **HBC lives on p53 at `/media/developer`** (= `/mnt/lg/appstore` is the same fs mount point). Its init.d hooks are inside p53 (HBC installs them via the webosbrew bind mechanism onto p52's `/var/lib/webosbrew/init.d` for jailable services — check that against the HBC install layout later, but the actual package binaries are in p53).
- **HBC runtime state lives on p52**: `/var`, `/home`, `/mnt/lg/cmn_data`, `/mnt/lg/flash/data`, `/mnt/lg/user`, and the caches. Also `/etc/passwd` bind.
- **Factory reset reformats p52 + p53** (verified earlier this session — Q2). Everything in both is lost: HBC, all webOS user data, `/etc/passwd` additions, luna preferences cached on p52. **p51 db8 survives factory reset** (not in the reformat set) — luna settings DB persistence. **p15 authcxt, p46 uhdcp also survive**.
- Per-app jails (com.webos.app.actionhandler, lg.thinqai.adapter) are overlay chroots stacking bsppart over the service's view, with select ext4 binds from p52/p53. These do not change the writability map.

## 5. Attack-surface summary (writable + not boot-verified)

Ranked by useful size and what currently sits there. Verification of "not boot-verified" is pending A1 for the asterisked entries.

1. **p53 apps (4.32 GiB, /media, HBC root).** Writable rw ext4. Factory-reset target. Verification: no boot-time check *expected* (user data), **UNKNOWN pending A1** — specifically whether lxboot or any pre-userland stage reads `/media/developer/*` or the init.d hook paths. This is where a custom-firmware payload can live at full size and already is for HBC. Bypasses the rootfs signing problem entirely because nothing in A/B touches p53.
2. **p48 hib (150 MiB CRIU snapshot).** Raw, writable from root, holds process memory captured at the boot-fast point. Signed at creation (`sb_sign_snapshot_image`); **UNKNOWN whether lxboot or the kernel verifies on resume** — this is the single most promising unknown. If unverified, writing a forged snapshot flips the normal-boot process set to whatever we like, pre-userland. If verified, strike this.
3. **p52 data (550 MiB, /var + /home + /etc/passwd).** Writable rw ext4. Factory-reset target. Not boot-verified in itself, but what it controls (shells, luna prefs, init overrides) is read after lxboot hands off, so it only lets us persist userland changes — exactly where HBC already acts. Useful as a staging area that doesn't rely on signing bypass.
4. **p22 kernel backup (16 MiB).** Raw, unmounted, writable. Verified by lxboot `sb_verify_image` **on swap to active**; when passive, no check. So useful only as a forged-signature test target (we have the trailer format from the rootfs writeup, same scheme). If we can re-sign a kernel for 05.40.20 and get expert mode via downgr8, the swap will accept it. Attack surface = "if sig bypass".
5. **p38–p45 backup slot (rootfs 831 MiB, fonts 86 MiB, etc.).** Same story: raw & writable while inactive, verified by lxboot before swap. Useful only after sig bypass or re-sign.
6. **p51 db8 (112 MiB, settings DB).** Writable, ext4, **survives factory reset**. Not boot-verified*. Attractive as a quiet persistence channel: luna reads it early. Smaller than p52 but the survive-reset property is unique.
7. **p27/p37 pmsfw (1 MiB each), p34/p44 tzfw (2 MiB each), p25 logo (512 KiB), p26/p36 hwsetting (2 MiB).** Small raw partitions. **Verification UNKNOWN pending A1** — tzfw *should* be in the signing chain (TrustZone fw), pmsfw/logo/hwsetting are suspiciously unmentioned in docs/recovery.md's verification set and docs/recovery.md marks them as "live" restore (writeable live). Highest-value small unknown is pmsfw: panel firmware could be a lateral-escalation vector if unsigned, and it's writable from a running root.
8. **p49 dump (10 MiB), p50 hist (512 KiB), p47 profdata (512 KiB), p46 uhdcp (5 MiB), p15 authcxt (6 MiB).** Small; useful as markers/scratch, not as firmware-size install targets.
9. **mmcblk0boot0/boot1 (4 MiB each).** `force_ro=1` gate, but root can flip. boot0 holds data per docs/recovery.md; no boot-verification path documented from this stage. **UNKNOWN pending A1** whether boot0 contents are read by the ROM or just the eMMC controller as a boot region pointer.

**Top three primary installation targets for persistent custom firmware beyond HBC init.d hooks:**
- p53 (/media, 4.3 GiB) — biggest, already friendly to HBC, factory-reset is its only kill switch.
- p48 (hib, 150 MiB) — highest-leverage *if* A1 confirms no resume-path verify; flips pre-userland without touching signed partitions.
- p51 (db8, 112 MiB) — only writable partition that survives factory reset and is read early.

## Loose ends / cleanup

- No writes made. No files left on the TV. SSH session closed.
- A1 (lxboot RE) is the gate for finalising the "boot-verify" column for p48, p53, p25/26/27/36/37, p34/44, and p22-without-swap. Those cells are marked UNKNOWN above.
- Did not touch mmcblk0boot0/1 `force_ro` (would have needed a write), did not dd anything (per constraint — offline Oct 25 image covers it).
- RPMB not inventoried beyond its presence; it is not readable without the authentication key.

## Raw

`b9-raw/a3-parts/a3-session.txt` — complete captured output from the one SSH session (798 lines).
