# Boot chain & upstart jobs

How the TV starts, from upstart to Homebrew Channel's `init.d` hook; the security holes a fresh root leaves open; and what each upstart job is for. The audit was read-only. Later changes (the telnet fix, the ACR and ads block) are dated in their own sections.

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

- **ACR/ads still active with Live Plus off** (as of 2026-10-25; blocked since, see [ACR / ads daemon block](#acr--ads-daemon-block-2026-10-26)). `option.livePlus: off`, `general.personalRecommend: off`, `homePromotion: off`, and `general.adCookie`, `option.watchedListCollection`, `option.webOSPromotionVideo`, `option.hbbTvDeviceId` have been set to `off` via luna (verified stuck after 5 s). The stored User Agreements (`/var/luna/preferences/eula`: `acrOnAllowed`, `acrAdAllowed`, `customAdAllowed` etc. still true) have no local luna setter and are left alone because changing them goes through LG's servers; `/var/luna/preferences/FirstPOPUPACR` = `ACR Success`. `acr2`, `livepick`, `scd-service`, `admanager` resident (livepick/scd started ~10 min after boot).
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

### Standby-wake audit (2026-10-26)

Every job on `instant-boot-done` was read in full (`/etc/init/*.conf`) and
checked with `initctl status` and `ps`. Only `aiservice` is worth neutralizing,
and that is already done (see above). The other three are short one-shot
scripts, not daemons or app launchers, so there is no "wake restart" to trim.

| Job | What it does | Verdict |
|---|---|---|
| `SettingsService-recovery` | Runs `/usr/bin/recover_hdr_psm.sh`: if the HDR or Dolby Vision picture mode is the Amazon-specific one, it restores the user's backed-up mode. Otherwise it prints "No need to recover". About 8 `luna-send` calls, no process left (`stop/waiting`; a manual `initctl start` returned in 0.01 s). | (a) needed and harmless. Neutralizing could leave the picture stuck in an Amazon HDR mode. |
| `com.webos.app.livemenu` | Despite the name this is not the app. It sends two `setSystemSettings` calls: `liveMenuLaunched=false`, `epgPipMode=off`. No process stays. | (a) harmless; it resets guide state after a wake. Not worth a bind-mount. |
| `com.webos.app.multiview` | Reads `multiViewStatus`. Only if it is `on` does it reset it to `off` and re-enable some caption and sound settings. Otherwise prints "No need to recover multi view settings". | (a) harmless; a read-only query in the normal case. |

The live menu *app* is a separate thing: `/usr/bin/com.webos.app.livemenu`
(about 59 MB RSS) is a CRIU snapshot-restored, hidden, overlay app listed in
`CRIUSupportApps` in `sam-conf-tv.json`. No upstart job launches it. It is the
Guide/channel overlay. Closing it with `closeByAppId` is possible, but it is
part of the snapshot set, so it is (c): left alone.

Other wake-time activity found (not changed, no standby cycle was run to prove
causes):

- `webos-preload-manager` (starts on `boot-done`, about 2 MB) launches
  `netflix` through SAM about 8 s after a wake (`caller_id` in the SAM log).
  That process is about 40 MB RSS. Which apps it preloads comes from the
  modeled app list and `/var/preferences/webos-preload-manager-conf.json`
  (absent now). Disabling it would trade Netflix launch speed for RAM, so it is
  an owner decision, not a safe default.
- `/usr/sbin/airplay` was spawned on the same wake and launched the `airplay`
  web app (about 58 MB renderer) with `caller_id` `airplay.service`, although
  Phase 4 closes that app at boot and `airplay-adaptor` is stopped in Phase 1.
  `airplay-adaptor` is also a static luna service, so ls-hubd can start it
  regardless of the upstart job. The cause is unproven.
- `com.webos.app.googleassistant` was running again about 54 s after boot,
  after Phase 4 closed it at about 35 s.
- Free memory is tight: about 450 MB available of 1.6 GB, with swap in use.

Only a real wake can show: whether the airplay app and Netflix preload recur
after every wake, and whether anything else follows `instant-boot-done`.
Check with `grep NL_APP_LAUNCH_BEGIN /var/log/messages` after one cycle.

## Disable candidates (none applied; ACR/ads block applied 2026-10-26, see below)

`/` is read-only, so job files can't change. Settings persist. Upstart jobs can only be stopped per boot via an `init.d` script running `initctl stop <job>` (at ~37 s, after they already started). Killing a respawn job's PID just restarts it. On-demand ls-hubd services can only be blocked by bind-mounting over their `.service` file (risky).

| Candidate | Method | Risk |
|---|---|---|
| **Root telnet :23** | `touch /var/luna/preferences/webosbrew_telnet_disabled`, reboot | low; loses the failsafe recovery shell |
| Default root password | fixed on next reboot (keys exist); optionally disable dropbear password auth | low |
| ACR / ad tracking | Settings → user agreements: ad tracking, viewing info, watched-list collection off; optional hosts entries | low via UI; hosts blocking can break Content Store/home tiles |
| acr2, livepick, scd, admanager | bind-mount empty over `.service` from init.d | applied 2026-10-26 with a hub rescan; see [ACR / ads daemon block](#acr--ads-daemon-block-2026-10-26) |
| rdxd, uploadd, crashreportd, remotelogger | `initctl stop` from init.d | low–medium; small gain (spools already ro) |
| contentminer | `initctl stop` from init.d | medium: may feed home/search |
| update, certupdmgr_timer | `initctl stop` from init.d | medium: certupdmgr may refresh TLS roots |
| **Never touch** | ls-hubd (watchdog reboots TV), sam, bootd, tvservice, surface-manager, configd, db8*, PmLogDaemon, lginit_app | boot loop / brick territory |

Gotchas: `luna-send` over plain `ssh` prints nothing — use `ssh -tt`. Busybox `timeout` needs `-t`.

## ACR / ads daemon block (2026-10-26)

Applied live and added to Phase 3 of `scripts/50-custom-runtime`.

**How they start.** `acr2`, `admanager`, `scd-service`, `sdx`, `livepick` and `nlpmanager` are children of `ls-hubd`, not upstart jobs. ls-hubd launches one on the first luna call to its name, using the `.service` file named in the service's manifest (`/usr/share/luna-service2/manifests.d/*.manifest.json`). Most of those calls come from activitymanager activities (`/etc/palm/activities/<service>/`, plus activities the daemons register themselves):

| Daemon | Service file | What calls it |
|---|---|---|
| `acr2` (content recognition) | `/usr/share/dbus-1/{services,system-services}/com.webos.service.acr.service` | `rest-boot-done`; its own `acr_wake_up_by_power_on` / `..._liveplus_on` activities (every wake from Active Standby) |
| `admanager` (ad cookie, ad app) | `dbus-1/…/com.webos.service.admanager.service` | network up; its own activities on wake, suspend, power-off, foreground app, `adCookie` change |
| `scd-service` (captures HDMI frames and fingerprints set-top-box banners) | `dbus-1/…/com.webos.service.scd.service` | activity on any HDMI input coming to the foreground. This is why it came back 30 minutes after boot. |
| `sdx` (client for LG's server API: signing, login session, EULA, clock) | `dbus-1/…/com.webos.service.sdx.service` | network up; `admanager` and `acr2` send through it |
| `livepick` | `luna-service2/services.d/com.webos.service.livepick.service` | activity on live TV or HDMI in the foreground |
| `nlpmanager` (voice intent routing) | `luna-service2/services.d/com.webos.service.nlpmanager.service` | the activity that starts it at boot fires when `sdx` registers. It is stopped, not blocked: a direct `nlpmanager/load` call would still relaunch it. |

**Why the old Phase 3 did nothing.** It blanked the `livepick`, `contentminer` and `dot` service files at about 32 s. ls-hubd had already parsed them seconds into boot and doesn't watch the files. Verified: with the file blanked, `kill` livepick, then `livepick/wakeup` relaunched it within 0.3 s. A blanked file only takes effect after a hub rescan, which is SIGHUP to `ls-hubd` (what `ls-control scan-services` sends; `pmServicePostInstall.sh` and HBC's `elevate-service` run it routinely).

**Why not stub the binaries.** An exit-0 no-op bind-mounted over `/usr/sbin/admanager` made every call to it hang: the hub waits for the child to register for `LaunchTimeout` (300 s in `/etc/luna-service2/ls-hubd.conf`) and doesn't fail the call when the child exits. Measured: two calls, each killed by `timeout -t 20` after 20 s with no reply.

**What Phase 3 now does.** It blanks both dbus-1 copies of the acr, admanager, scd and sdx service files (plus the three it already had), sends SIGHUP to ls-hubd, then TERMs and KILLs any running `livepick acr2 admanager scd-service sdx nlpmanager`. After that every call returns `Service does not exist: com.webos.service.<name>.` in about 10 ms, so the activities on wake fail fast and nothing relaunches. The bind mounts and the hub's rescanned state survive Active Standby, because the process tree is kept. A later rescan, for example from HBC, re-reads the same blanked files.

**Left alone:**
- `tnm` is the thumbnail manager (JPEG decode/encode for cbox, videothumbnailer and live TV). It isn't tracking.
- `com.webos.app.livepick` is a `Type=static` entry and doesn't run.

**Side effects:**
- The rescan also activates the existing `dot` and `contentminer` blanks. `bluetooth-dot-service`, the proximity popup for LG soundbars and Tone+ headsets, keeps running, but its luna API now answers "Service does not exist". contentminer is already stopped in Phase 1.
- With `sdx` gone, anything that needs LG's servers fails fast. The firewall already blocks those servers.

**Verified live (about 4.7 h uptime):**
- After the block, nothing respawned in more than 5 minutes.
- `ls-hubd` kept its PID, and HBC's own service and the volatile-dir services still answer.
- The HDMI input stayed in the foreground and `applicationManager/running` was unchanged.
- `initctl list` matched the baseline, and no crash files appeared.

**Not yet tested:**
- A wake from Active Standby. Expected: the wake activities fail fast and leave no process.
- A cold boot. It runs the race between sdx and acr2 starting at 22–32 s and this script at about 32 s. The SIGHUP lands in the boot tail (`boot-done` is at about 34 s, when `bluetooth-dot-service` starts). The `dot` and `contentminer` blanks take effect at boot for the first time. After the first reboot, check that `initctl list | grep dot` and `ps` show one steady `bluetooth-dot-service` PID, not a respawn loop. Also check that `/tmp/custom-runtime.log` shows the stopped/killed lines.
- The clock after a cold boot. `time/getSystemTime` reports `systemTimeSource: "sdp"`, which is the clock `sdx` sets from LG's server. LunaSysService also has an NTP path (`setTimeWithNTP`, run by a periodic activity) that may be gated (`AllowNTPTime`). Untested whether NTP or broadcast time takes over when `sdx` is blocked. A wrong clock would break TLS in apps.
