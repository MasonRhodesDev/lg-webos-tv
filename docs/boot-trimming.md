# Boot trimming for monitor-only use

Read-only research, 2026-10-25. Goal: a "dumb HDMI monitor" (HDMI picture, audio out, HDMI-CEC/SIMPLINK power + input switching) with the fastest power-on.

## Verdict

**Trimming services cannot make the picture appear sooner.** HDMI is already fullscreen before anything trimmable starts.

From the TV's own `previous_boot_logs.tar.gz` → `log/bootd.log` and `log/messages.0.gz`:

| Event | Time |
|---|---|
| bootloader + kernel + drivers + snapshot resume | 0 → 14.45 s |
| `BOOTD_START` | 14.45 s |
| `powerd-ready` (tvpower / tvservice) | 15.59 s |
| inputcommon (HDMI2) launch requested → success | 15.69 → 16.12 s |
| **HDMI picture**: `NL_SURFACE_STATE_CHANGE {"app_id":"com.webos.app.hdmi2","screen_state":"FULLSCREEN"}` | **16.51 s** |
| `rest-boot-done` | 28.0 s |
| `boot-done` | 31.0 s |
| AirPlay, Google Assistant preload, Netflix preload | 38 s, 53 s, ~62 s |
| earliest user hook (Homebrew `init.d`) | ~35 s |

The 16.5 s to picture is bootloader, kernel, driver init and CRIU snapshot resume (to 14.45 s), then ~2 s of essential power and HDMI-app restore. Telemetry, update, casting, voice and preloads all start after the picture. **Realistic gain from any safe trim: ~0 s.** Trimming buys a quieter TV (CPU, RAM, telemetry, LAN exposure), not speed.

## No early hook exists

Boot chain (`/proc/cmdline`: `root=/dev/mmcblk0p28 ro rootfstype=squashfs … snapshot resume=/dev/mmcblk0p48 … criu_enabled`):
kernel → upstart `SetInitEnv` → `mount-bsp` (read-only squashfs BSP overlay, `pivot_root`, `initctl reload-configuration`) → `mount-readonly-volatile` → `ls-hubd` → `snapshot-boot-sync` → snapshot resume → `mount-readwrite` → `bootd`.

Ruled out:

- **`/` is read-only throughout early boot.** The single `reload-configuration` in `mount-bsp` runs against a read-only stack, so job files can't be masked.
- **The manually mounted rw overlay** (`/var/lib/rootfs_upper`) is referenced by no job or init script. It's a hand-mounted, runtime-only artifact.
- **Early jobs read rw storage only as data**, never as scripts:
  - `SetInitEnv`: `/mnt/flash/data`, `/mnt/lg/cmn_data/appfrwk_mask`, `/var/cache`
  - `surface-manager`: `/var/luna/preferences/directrendering_enabled`, `/mnt/lg/cmn_data/snapshots`
  - wifi/BT/lginput driver jobs: `/mnt/lg/cmn_data/pdm/*`
  - `snapshot-resume-jobs`: PmLog whitelist (runs after the picture)
- **`devmode.conf`** (~19.7 s) runs a script from rw storage only if `openssl dgst -sha512 -verify …/com.palm.service.devmode/pub.pem` passes, which needs LG's key.
- **Kernel cmdline / bootloader env** (`env_nvm`): changing them needs DEBUG mode, which on webOS 4+ can't be enabled on a TV that doesn't boot ([downgr8](https://github.com/throwaway96/downgr8)). The partition table shows a secure-boot chain: `secureboot`, `tzfw`, `sestore`, `wossestore`, `sedata`, and an `sbkey=` on the cmdline.
- **CRIU snapshot images:**
  - Made only in a bootloader-driven "making" boot (`/sys/power/mode`), not by anything a user can trigger.
  - Copies are `md5sum -c` validated (`criu_copy_img.conf`).
  - The resume image is the raw `hib` partition (p48, ~150 MB).
- **Community:**
  - RootMyTV v1/v2 are patched.
  - Current root ([faultmanager-autoroot](https://github.com/throwaway96/faultmanager-autoroot)) works post-boot only.
  - No project offers a pre-userspace hook or a persistent early rootfs overlay on webOS 4.x.
  - [webosbrew docs](https://www.webosbrew.org/pages/filesystem-overlays.html) say overlays are non-persistent and re-applied from `init.d`. `run-parts` skips filenames outside `[a-zA-Z0-9_-]`.

Upstart note: `initctl reload-configuration` after masking a job only affects future starts; it never stops a running instance. Post-boot the only lever is `initctl stop <job>` (killing the PID of a respawn job restarts it).

## Custom firmware pipeline

- **Unpack:** [epk2extract](https://github.com/Informatic/epk2extract) handles EPK v2/v3. It needs AES and RSA keys dumped from a running TV, and works on USB firmware images from LG support, not NSU images.
- **Repack:** epk2extract doesn't repack. Secure boot (partition layout + `sbkey`) almost certainly rejects an unsigned modified rootfs. No community project has booted a modified rootfs on any webOS 4+ OLED. *(Inferred, strongly supported; no "signature failed" log observed.)*
- **Brick risk** (per downgr8): a webOS 4+ set that doesn't boot, with DEBUG never enabled, is recoverable only by reprogramming the eMMC directly (board pads or desoldering).
- **Payoff:** even if it worked, the 14 s before bootd is bound by hardware, drivers, eMMC reads and snapshot resume, so it would save little.

**Not recommended.** See [recovery.md](recovery.md) for the recovery-path research.

## Services for monitor-only use

"Drop" means `initctl stop` from a Homebrew `init.d` script after boot. It saves resources, not boot time.

| Service | Verdict | Why |
|---|---|---|
| ls-hubd, xinetd/dbus, configd, bootd, sam, activitymanager, LunaSysService, SettingsService, securitymanager, db8* | **keep — never touch** | IPC/boot backbone. ls-hubd's watchdog reboots the TV. sam launches the HDMI app. |
| tvservice, lginit_app, kdrivers-*, firmware_audio/vdec, oled-epl, kadpd | **keep** | Panel/HDMI/audio pipeline. oled-epl is OLED panel protection. |
| surface-manager, gm, WebAppMgr | **keep** | Compositor, plus the runtime hosting the HDMI input app. |
| inputcommon, home, fullhome (CRIU boot apps) | **keep** | inputcommon *is* the HDMI picture. |
| audiod, pulseaudio, umediaserver | **keep** | Audio out and HDMI audio routing. |
| eim, physical-device-manager, lginput2(-adv), user-context-manager, event-monitor, nopd, AcbService | **keep** | **HDMI-CEC (SIMPLINK) and external-device path.** |
| tvpowerd, sleepd, memchute, PmLog*, faultmanager, snapshot-boot-sync, criu, emmcd, notificationmgr, appinstalld, LunaDownloadMgr, webos-preload-manager | **keep** | Power state gates the picture. Removing infra risks a boot loop. |
| wpa-supplicant, connman, webos-connman-adapter, pacrunner | keep if networked | Needed for SSH and Home Assistant. |
| tvrm, utp, iepg, rec-listmgr, rec-info-adapter | **unknown → lean keep** | utp answers `getLastInput` (`HDMI_2`), so it's on the input path. Test one at a time. |
| MaliitServer, nudge | unknown | UI helpers. Leave alone. |
| rdxd, uploadd, crashreportd, remotelogger, contentminer, dpp | **drop** | LG telemetry. Low risk; contentminer medium. |
| update, certupdmgr_timer | drop | Updates are already host-blocked. certupdmgr refreshes TLS roots, which only matters for networked apps. |
| acr2, livepick, scd-service, admanager | drop (ACR/ads) | On-demand only. Blocking them means bind-mounting over the `.service` file. Medium–high risk: callers may hang. |
| netflix, cobalt, airplay + homekit, googleassistant preloads | drop | See [background-apps.md](background-apps.md). |
| dmr, airplay-adaptor, miracast, btaudiosrc/snk, wisa-manager, asc, ssdp-discovery-lgtv, avahi, mdnsd, bluetooth services, qosm, iot-client | drop for monitor use | Casting/discovery/BT audio. Keep BT if you use a BT remote. |
| voiceconductor, voiceinput, aiservice | drop | Voice/AI. |

## Options, ranked

1. **Leave boot alone; stop telemetry and unused network, casting and voice services from `init.d`.** Low risk, reversible (delete the script), 0 s gain.
2. **Disable preloads** (`/var/preferences/webos-preload-manager-conf.json`, or AirPlay/GA off in Settings). Low risk. Schema unverified, so test one app first.
3. **Block ACR/ad on-demand services** via `.service` bind mounts. Medium–high risk.
4. **Stop `update` / `certupdmgr`.** Medium risk; fine for a pure monitor.
5. **Custom firmware.** Very high risk, blocked by secure boot, small payoff. Not recommended.
6. **Regenerate a slimmer CRIU snapshot.** Not reachable without firmware-level access.

For faster power-on, the remaining lever is avoiding a cold boot entirely (Quick Start+), still under evaluation.
