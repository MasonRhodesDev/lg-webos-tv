# Boot chain & upstart jobs

Read-only audit as root, 2026-10-25 (~20–25 min uptime). One scratch file was briefly created and removed on `/tmp`; nothing else was written, started or stopped.

## Security findings

**Status 2026-10-25: items 1–2 fixed.** Created `/var/luna/preferences/webosbrew_telnet_disabled` and rebooted. After the reboot, no `telnetd` runs, port 23 is closed, `/etc/shadow` is no longer bind-mounted (no `alpine` password), key SSH works, and the custom-user `init.d` script ran at boot (its `/etc/passwd` bind mount is present and the user can log in).

Gotcha: `reboot` backgrounded inside an SSH command (`(sleep 1; reboot) &`) dies when the session closes. Run `sync; reboot` in the foreground; the session drops when the TV goes down.

1. **Unauthenticated root shell on the LAN.** Homebrew Channel starts `telnetd -l /bin/sh` on `0.0.0.0:23` unless `/var/luna/preferences/webosbrew_telnet_disabled` exists. Anyone on the network gets root with no password. Fix: `touch` that file and reboot (keep SSH working first — telnet is HBC's failsafe recovery path).
2. **Root password `alpine` until the next reboot after rooting.** `startup.sh` bind-mounts a `/tmp/shadow` with root:`alpine` whenever `/home/root/.ssh/authorized_keys` is missing at boot. If keys were added after that boot, dropbear (`-R`, password auth not disabled) likely accepts `root`/`alpine` until the next reboot. Untested. Fixed automatically on reboot once the key file exists.
3. **Root SSH by key** via HBC's dropbear on :22.

## Boot chain

- `/` is a **read-only overlay** over squashfs (`/proc/mounts`). All 182 `/etc/init/*.conf` jobs are stock LG; no `.override` files possible.
- kernel → `/sbin/init` (upstart 1.10) → `SetInitEnv`, `mknod`, `kdrivers-*`, `mount-readonly-volatile`, `bootmisc`, `ls-hubd`, `xinetd`/`dbus` → `mount-readwrite` (on `snapshot-resume-done`) → `bootd`.
- `bootd` sequences the rest by emitting signals. This is a **snapshot (CRIU) boot** (`--Snapshot=YES`): home, fullhome and inputcommon are restored from images. Logs read 2019-01-01 until clock sync at ~23 s.
- `devmode.conf` is **not** the HBC hook (its `start-devmode.sh` doesn't exist). `/var/luna/preferences/devmode_enabled` is a **directory** — HBC's trick to keep `/media/developer` from being wiped.

### Homebrew Channel hook

- Service `org.webosbrew.hbchannel.service` is registered in the dev hub (`/var/luna-service2-dev/services.d/`, `client-permissions.d/...service.root.json`). Its `Exec` is a sed-patched `run-js-service` (`thirdparty_jail=off`, devmode check off) → runs unjailed as root.
- `service.js` `autostart` is triggered by an activitymanager activity (`com.webos.bootManager/getBootStatus`, `core-boot-done == true`) and/or the app's `appinfo.json` `previewMetadata.targetEndpoint`. Which one fired wasn't confirmed.
- `autostart` runs `/var/lib/webosbrew/startup.sh` (identical to the bundled copy) ~35–37 s after init, right around `boot-done`.

### What `startup.sh` does

- Once per boot (flock `/tmp/webosbrew_startup.lock` + marker `/tmp/webosbrew_startup`).
- **Failsafe:** if `/var/luna/preferences/webosbrew_failsafe` exists (crash during last startup), only start root telnetd + toast + reboot prompt, clear the flag. Otherwise set the flag, `sync`.
- Close inherited fds; remove `dc*` (devmode reboot counter).
- `webosbrew_block_updates` set → bind-mount `/etc/hosts` sending `snu`, `su-dev`, `su`, `su-ssl.lge.com` to localhost. (Set on this TV.)
- No `webosbrew_telnet_disabled` → `telnetd -l /bin/sh`. (Absent on this TV.)
- `webosbrew_sshd_enabled` → `dropbear -R`. (Set.)
- Bind-mount a warning over `/etc/motd`.
- No `/home/root/.ssh/authorized_keys` → bind-mount `/tmp/shadow` with root:`alpine`; otherwise fix perms on the key file.
- **Telemetry:** read-only empty tmpfs over `/tmp/rdxd`, `/tmp/uploadd`, `/var/spool/rdxd`, `/var/spool/uploadd/{pending,uploaded}` (confirmed in `/proc/mounts`).
- `elevate-service` unless `SKIP_ELEVATION` (set on the autostart path).
- `run-parts /var/lib/webosbrew/init.d`.
- `sleep 10`, clear failsafe flag.

The only non-LG, non-HBC addition is a custom `init.d` script that bind-mounts a custom passwd to add a non-root user. It was first verified to run at boot on the 2026-10-25 reboot.

## Upstart jobs by purpose

R = `respawn`. Running/PIDs from `initctl list` as root, cross-checked with `ps`.

| Group | Running | Not running |
|---|---|---|
| Core init / IPC | ls-hubd, xinetd, PmLogDaemon(R), PmKLogDaemon(R), crashd(R), configd(R), bootd(R), sam(R), criu(R), memchute(R), snapshot-boot-sync, faultmanager(R), sleepd(R), tvpowerd(R), securitymanager(R), activitymanager(R), notificationmgr(R), LunaSysService(R), SettingsService(R), db8 (maindb/tempdb/mediadb/epgdb), appinstalld(R), LunaDownloadMgr(R), webos-preload-manager(R), physical-device-manager(R), emmcd | mount/sysctl/udev/zram/swap tasks, ls-hubd watchdog, snapshot-boot-*, reboot/shutdown, webos-jail, *-ready signals |
| Graphics / UI / input | gm, surface-manager(R), WebAppMgr(R), MaliitServer(R), lginput2(R), eim(R), AcbService(R), nopd(R), oled-epl(R), user-context-manager, nudge(R), event-monitor(R) | gpu-libs, booster (exits; QML booster off), app launch tasks (home/fullhome/inputcommon run under sam), factorywin |
| TV / broadcast | tvservice, lginit_app, kadpd, tvrm(R), utp(R), iepg(R), rec-listmgr(R), rec-info-adapter(R) | kdrivers*, firmware_audio/vdec, tvconfig-gen, storedemo, ibb-manager(R), wmp |
| Media / audio / casting | audiod(R), pulseaudio(R, `--log-level=debug`), umediaserver(R), dmr(R, DLNA), airplay-adaptor(R), miracast, required_dmost(R), btaudiosrc(R), btaudiosnk(R), asc(R), wisa-manager(R) | gst-env/registry, bosp (B&O) |
| Network / BT / discovery | wpa-supplicant(R), connman(R), pacrunner(R), webos-connman-adapter(R), avahi-daemon(R), avahi-adaptor, mdnsd, ssdp-discovery-lgtv(R), webos-bluetooth-service(R), bluetooth-dot-service(R), qosm(R) | wifi/bt driver tasks, tvlink-network-proxy(R), iot-client(R; exits, no config), amazon-alexa-adapter |
| Voice / AI | voiceconductor(R), voiceinput(R), aiservice | — |
| LG telemetry / diagnostics | rdxd(R, remote diagnostics), uploadd(R), crashreportd(R), remotelogger(R), contentminer(R), dpp | admanager (dir setup task), livepick (on demand) |
| Updates / certs | update, certupdmgr_timer(R, `sleep 24h` loop) | certupdmgr, start_update |
| Developer / debug | — | devmode (no script), SICDbgMonitor, browser-service |

**ls-hubd on-demand daemons** (not upstart; `/usr/share/{dbus-1/system-services,luna-service2/services.d}/*.service`): ACR/ads `acr2`, `livepick`, `scd-service`, `admanager`; plus nlpmanager, tnm, cbox, homekit, airplay, upnpd, sdx, pbs, avf, ssc, asm, hdcp2, iconnectivity, irdbmanager, tts, videothumbnailer. Preloaded apps: see [background-apps.md](background-apps.md).

## Other findings

- **ACR/ads still active with Live Plus off.** `option.livePlus: off`, `general.personalRecommend: off`, `homePromotion: off`, but `general.adCookie: on`, `option.watchedListCollection: on`, `option.webOSPromotionVideo: on`; `/var/luna/preferences/FirstPOPUPACR` = `ACR Success`. `acr2`, `livepick`, `scd-service`, `admanager` resident (livepick/scd started ~10 min after boot).
- **Telemetry only partly neutered:** spools are read-only, but rdxd, uploadd, crashreportd, remotelogger, contentminer still run; hosts block covers only the four update hosts.
- **Updates:** hosts blackhole active, but `update` and `certupdmgr_timer` still run.
- **Nothing respawn-looping:** all upstart PIDs have etime ≈ uptime. No current crashes (`/var/log/crashd`, `/var/log/reports/librdx` empty).
- **Network exposure (stock):** xinetd serves DIAL and second-screen/SSAP (`/usr/bin/nsl`, ports 3000/3001). Also listening: 1773, 1810, 1859, 1906, 1929, 2007, 7000 (AirPlay), 9998, 11111, 18181, 36866, UDP 1900 (SSDP), 5353 (mDNS). Not all mapped to processes (busybox `netstat` lacks `-p`).

## Boot timing (`/var/log/bootd.log`)

| Signal | Time |
|---|---|
| BOOTD_START | 14.32 s |
| powerd-ready | 15.48 |
| core-boot-done | 15.73 |
| first app (inputcommon / HDMI_2) | 15.78–16.5 |
| init-boot-done | 18.75 |
| minimal-boot-done | 19.66 |
| rest-boot-done | 30.02 |
| boot-done | 34.02 |
| boot-complete | 35.42 |

HBC `startup.sh` ~35–37 s; preloads: Google Assistant 55 s, Netflix 62 s, YouTube 650 s. No journal; `dmesg` has lost early boot.

### Cascade-trim research (2026-10-26)

- **The picture is up at about 17 s.** The first app is in the foreground
  before `init-boot-done`. Every service the overlay trims starts after that,
  from `minimal-boot-done` (about 20 s) up to `boot-done` (about 32 s). Trimming
  them reduces background load. It cannot bring the picture up sooner. The part
  before the picture runs before `/var` is mounted, so nothing writable reaches
  it (see [snapshot-boot.md](snapshot-boot.md#custom-snapshot-ruled-out-by-design)).
- **A cold boot is rare.** Turning the TV off with the remote puts it in
  Active Standby. Turning it on keeps the process tree and the overlay's
  changes, and `instant-boot-done` fires within 0.05–0.5 s of the power-on
  request (`bootd.log`). The full cascade runs only after a reboot or a loss of
  power.
- **`instant-boot-done` restarts jobs.** `aiservice`, `SettingsService-recovery`,
  `com.webos.app.livemenu` and `com.webos.app.multiview` start on it. The
  overlay used to `initctl stop aiservice`, which lasted only until the next
  wake. It now bind-mounts an exit-0 no-op over `/usr/bin/aiservice`, as it does
  for securitymanager. Verified: `initctl start aiservice` now exits at once and
  leaves no process.
- **`bootd` reads `/var/luna/preferences/bootd.json`**, which is writable, as an
  override of `/etc/palm/bootd.json`. That file only controls the first app,
  input-to-app mapping and nice values. It does not control signal order, so it
  is not a lever for boot time.

## Disable candidates (none applied)

`/` is read-only, so job files can't change. Settings persist. Upstart jobs can only be stopped per boot via an `init.d` script running `initctl stop <job>` (at ~37 s, after they already started). Killing a respawn job's PID just restarts it. On-demand ls-hubd services can only be blocked by bind-mounting over their `.service` file (risky).

| Candidate | Method | Risk |
|---|---|---|
| **Root telnet :23** | `touch /var/luna/preferences/webosbrew_telnet_disabled`, reboot | low; loses the failsafe recovery shell |
| Default root password | fixed on next reboot (keys exist); optionally disable dropbear password auth | low |
| ACR / ad tracking | Settings → user agreements: ad tracking, viewing info, watched-list collection off; optional hosts entries | low via UI; hosts blocking can break Content Store/home tiles |
| acr2, livepick, scd, admanager | bind-mount empty over `.service` from init.d | medium–high: callers may hang, failsafe may trip |
| rdxd, uploadd, crashreportd, remotelogger | `initctl stop` from init.d | low–medium; small gain (spools already ro) |
| contentminer | `initctl stop` from init.d | medium: may feed home/search |
| update, certupdmgr_timer | `initctl stop` from init.d | medium: certupdmgr may refresh TLS roots |
| **Never touch** | ls-hubd (watchdog reboots TV), sam, bootd, tvservice, surface-manager, configd, db8*, PmLogDaemon, lginit_app | boot loop / brick territory |

Gotchas: `luna-send` over plain `ssh` prints nothing — use `ssh -tt`. Busybox `timeout` needs `-t`.
