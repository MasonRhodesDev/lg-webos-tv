# Telemetry off

Goal: no LG tracking or telemetry, down to the running services, before the TV is allowed onto the internet. Kit: [tools/telemetry-off/](../tools/telemetry-off/README.md).

**Status 2026-10-26: Phase 1 (design, code, dry run).** Nothing in this kit has been applied. Firmware: webOS TV 4.10.0, 05.40.45 (`Rockhopper release 4.10.0-17`).

Evidence comes from the offline rootfs (`mmcblk0p28` squashfs from the 2026-10-25 backup), the backup's `/var` and `/mnt/lg/cmn_data` tars and settings dumps, and read-only checks on the live TV. Tags: **fw** = strings or config on this firmware; **live** = seen on the running TV; **cache** = in the TV's own data partitions; **lgws** = from [Life's Good Without Spying](https://github.com/lewisdoesstuff/lifesgoodwithoutspying) (MIT, commit 8c42711).

## Change list (what Phase 2 writes)

Phase 2 = `tools/telemetry-off/install.sh`, then a reboot (or `install.sh --apply-now`). Every item has its revert. `uninstall.sh` runs all of the reverts without a reboot, then removes the kit. Creating `/var/lib/telemetry-off/disabled` makes the next boot a no-op.

**Already on the TV before this kit, never reviewed.** `scripts/50-custom-runtime` (commit 5d8df4b) is installed in HBC `init.d` and runs every boot. While this phase ran, something else also changed the TV live: stubs appeared over `/usr/bin/aiservice` (18:49 TV time) and `/usr/sbin/admanager`, and `general.adCookie`, `option.watchedListCollection` and `option.webOSPromotionVideo` went from `on` (read at 18:55) to `off` (read at 19:00). None of that came from this kit. The verify baseline below therefore shows a partly protected TV, not the stock state.

### Files created

| Path | What | Revert |
|---|---|---|
| `/var/lib/telemetry-off/` | `telemetry-off.sh`, `targets.tsv`, `settings.tsv`, `wipe.list`, `telemetry-off.conf.example`, `domains/*.txt` | `uninstall.sh` (rm -rf) |
| `/var/lib/telemetry-off/telemetry-off.conf` | config, from the example, only if absent | same |
| `/var/lib/webosbrew/init.d/80-telemetry-off` | the hook, a copy of `telemetry-off.sh` | `uninstall.sh`, or `touch /var/lib/telemetry-off/disabled` |
| `/var/lib/telemetry-off/state/` | rewritten each boot: `stub`, `hosts`, `stubbed.list`, `stopped.list`, `flags.list`, `settings.orig`, `eula.orig`, `applying` | removed with the dir |
| `/var/log/telemetry-off.log` | log, trimmed at 128 KB | `rm` (uninstall keeps it) |
| `/var/luna/preferences/crashreportd_disabled` | LG's own crashreportd off switch (fw: crashreportd strings) | `revert` removes it (only if the kit created it) |
| `/var/luna/preferences/voice_server_sync_disabled` | LG's own voiceconductor server-sync off switch (fw: voiceconductor strings) | same |

### Bind mounts (per boot, gone after a reboot)

| Mount | Revert |
|---|---|
| `state/hosts` over `/etc/hosts`, stacked on HBC's tmpfs copy (HBC's four update entries are kept): 636 names to `0.0.0.0` and `::` | `revert` unmounts it only if the kit's marker is on top |
| `state/stub` (`#!/bin/sh` + `exit 0`) over each of: `/usr/sbin/acr2`, `/usr/sbin/livepick`, `/usr/bin/com.webos.app.livepick`, `/usr/sbin/scd-service`, `/usr/sbin/admanager`, `/usr/sbin/nudge`, `/usr/sbin/contentminer`, `/usr/sbin/prs`, `/usr/sbin/rdxd`, `/usr/sbin/uploadd`, `/usr/sbin/crashreportd`, `/usr/sbin/remotelogger`, `/usr/sbin/remotediag`, `/usr/palm/services/com.palm.service.bugreport/run-bugreport-service`, `/usr/sbin/voiceinput`, `/usr/sbin/voiceconductor`, `/usr/sbin/nlpmanager`, `/usr/sbin/nlpadapter`, `/usr/sbin/performer`, `/usr/bin/aiservice`, `/usr/sbin/amazon-alexa-adapter`, `/usr/sbin/lg.thinqai.adapter`, `/usr/sbin/iot-client`, `/usr/sbin/ocf-onboarding` (24) | `revert` unmounts each path in `stubbed.list` that still carries the kit's stub |

A path that already has someone else's mount on it is skipped and logged. Today that is `admanager` and `aiservice`, so the dry run binds 22.

### Services stopped or killed

| Action | Today's dry run | Revert |
|---|---|---|
| `initctl stop` (only if running): `nudge`, `livepick`, `contentminer`, `rdxd`, `uploadd`, `crashreportd`, `remotelogger`, `voiceinput`, `voiceconductor`, `aiservice`, `amazon-alexa-adapter`, `iot-client`, `update`, `certupdmgr_timer` | only `nudge` is running; 50-custom-runtime already stops the rest | `revert` runs `initctl start` on the jobs in `stopped.list` (only the ones this kit stopped) |
| Kill (TERM, then KILL after 1 s) any process whose `/proc/PID/exe` is a target binary, including inside a jail | `acr2` 4298, `livepick` 18516, `scd-service` 13856, `nlpmanager` 4311 (all launched by ls-hubd, PPID 1477), `nudge` 4666 | ls-hubd relaunches on-demand services on the next call once the stub is unmounted |

### Settings changed, from → to

Written with `settingsservice/setSystemSettings`, only when the value differs. The old value goes to `state/settings.orig` and `revert` writes it back.

| Key | Now (live, 19:00) | → | Backup 2026-10-25 |
|---|---|---|---|
| `option.channelplus` (LG Channels) | on | off | on |
| `option.appUpdateMode` | auto | manual | auto |
| `general.adCookie` | off | off (re-asserted) | **on** |
| `option.watchedListCollection` | off | off (re-asserted) | **on** |
| `option.webOSPromotionVideo` | off | off (re-asserted) | **on** |
| `general.customizedAd`, `homePromotion`, `aiNudge`, `screenSaverAd`; `option.livePlus`; `support.automaticUpdate` | off | off (re-asserted) | off |
| `general.lmt` (limit ad tracking) | on | on (re-asserted) | on |
| **User agreements** (`eulaStatus`, category `""`): `acrOnAllowed`, `acrAdAllowed`, `customAdAllowed`, `additionalDataAllowed`, `voiceAllowed`, `voice2Allowed`, `takeOnAllowed`, `chpAllowed` | true | **false** | true |

`generalTermsAllowed` and `networkAllowed` stay `true`. Withdrawing those makes webOS re-run first-use setup and gates the whole home screen. The original `eulaStatus` object is saved to `state/eula.orig`, and `revert` writes it back.

### Files wiped (each boot, after the stubs)

From the dry run: `/mnt/lg/cmn_data/admanager/cache` (39 ad creatives), `/mnt/lg/cmn_data/admanager/cookie` (1), `/mnt/lg/cmn_data/livepick/custom_db_save.db` (28 KB), `/tmp/livepick_nudge` (1), `/tmp/scd` (2), and `/mnt/lg/cmn_data/ucm/{app,channel,stb}_upload_time.txt`. The rest of `wipe.list` is empty today or sits under HBC's read-only tmpfs. **Revert: none.** Deleted files are gone, and LG recreates them on demand.

### Recommended, outside the kit (owner decision)

1. **Remove the overlapping stanzas from `scripts/50-custom-runtime`.** These are its stops of `rdxd uploadd crashreportd remotelogger contentminer update certupdmgr_timer voiceconductor voiceinput aiservice` and its `.service` masks. The kit owns those now. Coexisting is harmless (the jobs are already stopped when the kit runs, so the kit doesn't record them), but two owners make revert confusing. Its `.service` bind mounts don't work (see corrections).
2. **50-custom-runtime's securitymanager no-op is not telemetry.** It replaces `/usr/sbin/securitymanager` with `sleep`. That turns off runtime partition verification (`sb_verify_task`) and the `com.webos.service.sm` API, which serves `deviceid/getIDs` (the IFAID that acr2 subscribes to) and `verifyPartitions` (called by the updater). The kit does not carry it. Decide separately whether it stays.
3. **50-custom-runtime stops `dpp`, which is Wi-Fi Easy Connect, not telemetry.** fw: `dpp_supplicant_*`, calls `wifi/connect` and `wifi/findnetworks`. Harmless to stop, but it's not on the telemetry list.

## Inventory

How things start on this firmware decides the disable method:

- **Upstart job** (`/etc/init/*.conf`, PPID 1). `initctl stop` holds it until the next boot. A `respawn` job must be stopped, not killed.
- **ls-hubd on-demand** (`Type=dynamic` in `/usr/share/luna-service2/services.d/`, or any entry in `/usr/share/dbus-1/system-services/`; PPID = ls-hubd, 1477 today). `initctl` can't touch it, and ls-hubd relaunches it on the next luna call, often from an activitymanager trigger in `/etc/palm/activities/`. The only post-boot lever is a stub bind-mounted over the `Exec` binary, then a kill.
- Several are both (an upstart job plus a luna name).

### Collectors and senders

| Service | (b) Starts via | (a) Collects / (c) talks to | (d) Disable | (e) Breaks | (f) Risk |
|---|---|---|---|---|---|
| **acr2** | ls-hubd on demand, `dbus-1/system-services/com.webos.service.acr.service`; activity `com.webos.service.acr.start` fires `startAcr` at `rest-boot-done` (~28–30 s). live: running, PPID ls-hubd | ACR: screen and audio capture (`libcapture`, `libdile_audio_pcm`), Alphonso solution via `libalphonsosolution.so` → `libas.so` → `acrdb`/`eulacheck`/`prov-lg.alphonso.tv`. Config from sdx (`/tmp/acr.xml`, `sdp_check_acr`). Gated on `acrOnAllowed`, `acrAdAllowed`, `generalTermsAllowed`, `livePlus`, `lmt` (fw strings) | stub + kill; EULA flags; hosts | ACR ads and "Live Plus" | low |
| **livepick** (+ app `com.webos.app.livepick`) | upstart `livepick.conf` (respawn, no `start on`) and ls-hubd `Type=dynamic`; activity on foreground app. live: running from ls-hubd despite 50-custom-runtime's `.service` mask | ACR "shopping" (TheTake): scene captures `/tmp/livepick/capturedScene*.jpg`, `history.db`, `nudge.db`; `api.thetake.com` | stub + stop + kill | shoppable-scene overlay | low |
| **scd-service** | ls-hubd on demand, `com.webos.service.scd.service`; activity `scd.start.hdmi` on HDMI foreground. live: relaunched 20 min into the session | Screen content detection: captures `/tmp/scd/scd_capture`, OCR with tesseract (`liblept`, `libtesseract`), fingerprints `/mnt/flash/data/scd/fp`. Serves `getCurrentChannelNumber` to user-context-manager | stub + kill | set-top-box channel detection over HDMI | low |
| **admanager** | ls-hubd on demand; activity starts it when `isInternetConnectionAvailable`. (The upstart `admanager.conf` is only a mkdir task.) live: running | Ads: creatives cache `/mnt/lg/cmn_data/admanager/cache` (cache: `media.bidr.io/alphonso/…`, `cdn-aas-campaigns.alphonso.tv`, `lgad.cjpowercast.com.edgesuite.net`, `fts.lge.com`), cookie `…/cookie/ad_cookie` → `us.ad.lgsmartad.com` | stub + kill; `adCookie` off; hosts | home and screensaver ads | low |
| **nudge** | upstart `nudge.conf` (`start on ucm-ready`, respawn), luna static. live: running, PPID 1 | AI nudges; `/tmp/nudgeReport.txt`; `nudge_secure` → `aic.nudge.lgtvcommon.com` via sdx | stub + stop | home "nudges" | low–medium: surface-manager hosts the `com.webos.app.nudge` UI and gets errors |
| **contentminer** | upstart (`minimal-boot-done`, respawn) | Mines app contents for home/search via sdx | stub + stop | some home/search rows | medium |
| **prs** | ls-hubd on demand (`com.webos.service.prs`) | Personal recommendations: watched-list DBs `/mnt/flash/data/prs/PRS_DB*.db`, `prs_recmd_request_log.txt`; reads `watchedListCollection` | stub (not running) | recommendation rows | low |
| **rdxd** | upstart (`minimal-boot-done`, respawn), luna static | Remote diagnostics: `/tmp/rdxd/{analytics,crash,overview}`, `/var/log/reports/librdx`; upload URL from sdx `getRdxServerUrl` → `us.rdx2.lgtvsdp.com` | stub + stop (HBC already mounts empty ro tmpfs over its spools) | nothing user-visible | low |
| **uploadd** | upstart (`boot-done`, respawn) and ls-hubd dynamic | Uploads spools `/var/spool/uploadd/{pending,uploaded}`; history `/var/log/uploadd/uploadd-history.txt`; via sdx | stub + stop | nothing user-visible | low |
| **crashreportd** | upstart (`started rdxd`, respawn) | Crash reports `/var/spool/crashreportd/pending`, `/tmp/logfiles`; honours `/var/luna/preferences/crashreportd_disabled` | LG flag + stub + stop | nothing | low |
| **remotelogger** | upstart (`stopped mount-readonly-volatile`, respawn), very early | Crash unwinder (libunwind-ptrace, capstone) feeding `/var/log/crashd/` | stub + stop | local crash traces | low |
| **remotediag** | ls-hubd on demand (`com.webos.service.remotediag`) | LG remote support: `rone-*.lge.com` and **hardcoded IPs** `165.244.62.249:{6120,6230,6240}` (plus internal 10.x) | stub; **router block for the IP** | LG remote support | low |
| **bugreport** | ls-hubd on demand, `run-bugreport-service` (js) | `harmony.lge.com` (config-manager.js) | stub the Exec script | bug report upload | low |
| **voiceinput** | upstart (`core-boot-done`, respawn), luna static | Microphone capture (`libasound`, `libsbc`), `/tmp/voiceinput_debug.pcm`, `/mnt/lg/flash/data/voiceinput` | stub + stop | the remote's mic button | low |
| **voiceconductor** | upstart (`minimal-boot-done`, respawn) | Voice routing, server sync; honours `voice_server_sync_disabled` | LG flag + stub + stop | voice | low |
| **nlpmanager** | ls-hubd on demand; activity when sdx registers | NLP to LG: `/tmp/nlpmanager/mgr_*.txt` | stub + kill. live: running | voice search | low |
| **nlpadapter** (Google Assistant) | ls-hubd on demand via `jailer -t native_mvpd -i com.webos.app.googleassistant` | `embeddedassistant.googleapis.com`, gRPC | stub (see jail gap) + kill; EULA `voice*`; hosts | Google Assistant | low |
| **performer** (ThinQ action handler) | ls-hubd on demand via jailer (`com.webos.app.actionhandler`) | `wau.lgtvcommon.com`; `/tmp/performer/rekognition` | stub (jail gap) + kill; hosts | ThinQ voice actions | low |
| **amazon-alexa-adapter** | upstart (`mount-readwrite`) and ls-hubd via jailer (`amazon.alexa.view`) | `alexa.na.gateway.devices.a2z.com`, `d2na8397m465mh.cloudfront.net`; `/tmp/avs/alexaInput.pcm` | stub (jail gap) + stop + kill | Alexa built-in | low |
| **aiservice** | upstart (`boot-done`) and ls-hubd dynamic | Downloads AI models through sdx (`models.json`) | stub + stop. live: someone else's stub already on it | model updates | low |
| **lg.thinqai.adapter** | ls-hubd via jailer | `he-kr-qa-ai.lgthinq.com`; `/tmp/thinqai/request_*` | stub (jail gap) | ThinQ AI | low |
| **iot-client** | upstart (`rest-boot-done`, respawn) and ls-hubd | ThinQ/OCF: `common.lgthinq.com/route`, `kr.lgeapi.com`, `lss.lgthinq.com`; certs in `/mnt/lg/cmn_data/.ocf` | stub + stop | ThinQ app pairing | low |
| **ocf-onboarding** | ls-hubd on demand | OCF IoT onboarding (`/mnt/lg/cmn_data/.ocf/oic_prvn_mng.db`) | stub | ThinQ onboarding | low |
| **update** | upstart `update.conf` (`minimal-boot-done`) and ls-hubd; activities re-fire on storage and connection changes | Firmware: `snu`, `nsu`, `su`, `su-ssl`, `snu-dev.lge.com` | stop (no stub: the USB EPK recovery path needs it); hosts; `automaticUpdate` off | auto updates; **revert the kit before a USB recovery update** | low |
| **certupdmgr_timer** | upstart (`core-boot-done`, respawn, 24 h loop) | Cert updates | stop | TLS root refresh (matters only for networked apps) | low |
| **appUpdateService** (inside appinstalld) | activity `appUpdateService.check`, interval 1 d | App updates via SDP | `appUpdateMode` manual; hosts | auto app updates | low |
| **care365** | ls-hubd on demand, `run-js-service` | LG remote care: `download.365care.lge.com` | `other.care365.value` is already off; hosts | — | — |

Names LGWS uses that **don't exist on this firmware**: `sportsalarm`, `adoverlay-service`, `voiceinput_{network,preprocessor,hidraw,sound}`, `voiceclick`, `trigger_thinq`, `trigger_alexa`, `iot-proxy`, `mqtt-client`, `amazon-alexa-vsk`, `com.webos.app.livepick-full`. `webos-statistics-manager` has a `.service` file but no binary.

### Inside processes that must stay (network block only)

Both the HBC hosts file and the router cover these. Stubbing them would break the boot, HDMI/CEC, or the UI.

| Process | Why it stays | Telemetry inside |
|---|---|---|
| **sdx** (`com.webos.service.sdx`, on demand; activity on `isInternetConnectionAvailable`) | central SDP client: EULA, device auth, the store, and the URL broker for everyone above | Every LG upload goes through `sdx/send`: device auth, EULA sync (`/var/palm/license/eulaInfoNetwork.json`), `getRdxServerUrl`, `sdp_check_acr`. Covered by blocking `lgtvsdp.com` and the `lgtvcommon.com` names. Later-phase stub candidate, which would break the store and EULA screens |
| **user-context-manager** (keep-list, CEC path) | HDMI/CEC context, preload ranking | Uploads app, channel and STB usage through `sdx/send` (`/mnt/lg/cmn_data/ucm/{app,channel,stb}_upload_time.txt`, `server_available`). The kit wipes the timestamps; the network block stops the upload |
| **iconnectivity** (device connection / QuickSet) | HDMI device detection | `api.thetake.com` (hardcoded API key), UEI QuickSet `www.ueiwsp.com`; `other.ueiEnable` is on. Hosts covers `thetake`; `ueiwsp` is in LGWS's off-by-default list and is **not** blocked here (see open questions) |
| **pbs** (EPG / LG Channels) | guide data | `ibs.lgappstv.com` / `ibsstat.lgappstv.com` (statistics), `aic-qt2-ngfts.lge.com` logos |
| **WebAppMgr / home / fullhome** | UI | Home beacons and recommendations (`cdpbeacon`, `cdplauncher`, `homeprv`, `recommend`) through sdx-issued URLs; browser engine `libcbe.so` holds Google safe-browsing and `8.8.8.8` |
| **appinstalld** | app install (never-touch adjacent) | App update checks via SDP |
| **connmand** (networking, never touch) | network | Online check `http://lgtvonline.lge.com/` (`/etc/connman/main.conf`); `8.8.8.8` fallback compiled in |
| **securitymanager** | sm API, partition verify | device ID service (`deviceid/getIDs`, IFAID) |
| **Netflix (`GIBBON_MAIN`)** | an app | live: holds a UDP socket to **8.8.8.8:53**, i.e. its own resolver, which ignores `/etc/hosts` |

### Not telemetry (excluded on purpose)

`dpp` (Wi-Fi DPP); `faultmanager` and `crashd` (local crash handling, faultmanager is the root path); `homekit` and `airplay` (Apple, LAN; turn off in Settings → AirPlay if unused); casting and discovery (`dmr`, `upnpd`, `ssdp-discovery-lgtv`, `dial`), which 50-custom-runtime handles as LAN trimming.

### Timing gaps

- The HBC hook runs at ~35 s, but acr2's activity fires at `rest-boot-done` (~28–30 s) and connman, sdx and admanager start as soon as the network is up. **Every boot has a ~10 s window with no hosts blackhole and no stubs**, and webOS 4.x offers no earlier hook ([boot-trimming.md](boot-trimming.md)). Only the user-agreement flags (persistent) and the router block cover that window. **The router is the primary control; the TV-side kit is defence in depth.**
- Jails copy `/etc/hosts` once, when the jail is built (`/etc/jail_native_mvpd.conf`: `copy /etc/hosts`). live: the jails for `amazon`, `amazon.alexa.view`, `com.webos.app.actionhandler` and `com.webos.app.googleassistant` hold hosts copies with **none** of HBC's entries. A jailed process ignores the blackhole until its jail is rebuilt.
- **Jail stubs are unverified.** A jail's `/usr/*` are overlay mounts of the rootfs (`lowerdir=/mnt/bsppart/bsp:/`, live), and an overlay doesn't show bind mounts made on the host. Whether the jailer's `exec /usr/sbin/performer` sees the stub is untested. The kit kills jailed copies by exe path at boot. For relaunches it relies on the user-agreement flags (`voice*`) and the router.

## User agreements and privacy settings

| Key | Backup 2026-10-25 | Live 19:00 | Meaning (evidence) |
|---|---|---|---|
| `eulaStatus.acrOnAllowed` | true | true | "Viewing information" (Live Plus) consent; gates acr2 (fw) |
| `eulaStatus.acrAdAllowed` | true | true | ACR-based ads |
| `eulaStatus.customAdAllowed` | true | true | interest-based ads (`S_TAG`) |
| `eulaStatus.additionalDataAllowed` | true | true | additional data (`S_ADG`) |
| `eulaStatus.voiceAllowed`, `voice2Allowed` | true | true | voice information (`S_VNG`) |
| `eulaStatus.takeOnAllowed` | true | true | TheTake / livepick (`S_TAK`) |
| `eulaStatus.chpAllowed` | true | true | LG Channels (`S_CHP`) |
| `eulaStatus.generalTermsAllowed`, `networkAllowed` | true | true | base terms; left alone |
| `eulaStatus.remoteDiagAllowed`, `cookiesAllowed`, `thirdPartySharingAllowed`, `acrAllowed`, `acrGdprAllowed` | false | false | — |
| `general.adCookie` | **on** | off | ad cookie |
| `option.watchedListCollection` | **on** | off | watched-list collection (prs) |
| `option.webOSPromotionVideo` | **on** | off | promo video |
| `option.channelplus` | on | on | LG Channels |
| `option.livePlus` | off | off | Live Plus (ACR) |
| `general.personalRecommend` | off (`changedByUser`) | — | recommendations |
| `general.homePromotion`, `customizedAd`, `aiNudge`, `screenSaverAd` | off | off | — |
| `general.lmt` | on | on | limit ad tracking |
| `support.automaticUpdate` | off | off | — |
| `option.appUpdateMode` | auto | auto | app auto-update |
| `voiceframework.disclosureAccepted` | true | — | Google Assistant disclosure; not changed (voice stubs cover it) |
| `other.ueiEnable` | on | — | UEI QuickSet lookup; not changed |
| `/var/luna/preferences/FirstPOPUPACR` | `ACR Success` | — | first-use ACR popup was accepted |
| `/mnt/lg/cmn_data/acr/data/eula_allowed` | `allowed` | — | acr2's own cache of the consent |
| `doNotSellMyPersonalInformation` | absent | — | acr2 subscribes to it, but this firmware's `description.json` doesn't define it |

The terms the TV has accepted (`/mnt/lg/cmn_data/sdp/sdx/eula.json`, synced 2023-04-17): `S_SVC`, `S_CHP`, `S_TAK`, `S_ADG`, `S_TAG`, `S_VNG`, `S_PRG`, all status `A`.

How the stock UI withdraws an agreement (fw: `com.webos.app.eula/main.js`): it writes the merged `eulaStatus` object with `settingsservice/setSystemSettings`, calls `sdx/send` `sdp_terms_withdrawal` (network; it fails offline, harmlessly), then reboots with `tvpower/power/reboot` `micomReset`. The kit does the first step only; acr2 subscribes to `eulaStatus` changes, so a reboot isn't required. Settings → General → About This TV → User Agreements is the same switch through the UI.

## Domain list

Data files in [tools/telemetry-off/domains/](../tools/telemetry-off/domains/): **636 unique names** in the ten default files, plus `lgtvonline.lge.com` in the optional `95-connectivity-check.txt`. Each file records where every name came from.

| File | Names | Router parents (wildcard) |
|---|---|---|
| `10-ads.txt` | 164 | `lgsmartad.com`, `lgsmartad.net`, `bidr.io`, `cjpowercast.com`, `ads.lgtvcommon.com`, `videoads.lgtvcommon.com` |
| `20-acr.txt` | 17 | `alphonso.tv`, `lgads.tv`, `thetake.com` |
| `30-home-recommend.txt` | 144 | `lgtvcommon.com`, `wiselg.com`, `lgrecommends.lgappstv.com`, `lgsmartplatform.com` |
| `40-telemetry.txt` | 160 | `lgwebostv.com`, `lgecloudapm.com`, `rdx2.lgtvsdp.com`, `rone-*.lge.com`; IP `165.244.62.249` |
| `45-sdp.txt` | 91 | `lgtvsdp.com`, `nextlgsdp.com`, `tvsdp.lgeapi.com`, `ibs.lgappstv.com`, `ibsstat.lgappstv.com` |
| `50-thinq.txt` | 58 | `lgtviot.com`, `lgthinq.com`, `lgeapi.com` |
| `55-voice.txt` | 5 | `netflixvoice.lgtvcommon.com`, `embeddedassistant.googleapis.com`, `alexa.na.gateway.devices.a2z.com` |
| `60-lg-cdn.txt` | 11 | none safe; block the `*fts.lge.com` names individually |
| `80-lgchannels.txt` | 10 | `lgechannel.com`, `xumo.com` beacons |
| `90-updates.txt` | 6 | `snu.lge.com`, `su.lge.com`, `su-ssl.lge.com`, `nsu.lge.com`, `su-dev.lge.com`, `snu-dev.lge.com` |

Firmware facts the list depends on:

- **webOS 4.x uses `lgtvsdp.com`, not `nextlgsdp.com`** (`/usr/palm/sdx/server_addr_version.conf`, v10.2). LGWS's `nextlgsdp.com` list is kept for coverage after an update.
- sdx builds host names with a prefix: `domainType: default` gets the country (`us.lgtvsdp.com`; cache: `us.lgtvsdp.com`, `us.lgrecommends.lgappstv.com`, `us.ad.lgsmartad.com`), and `domainType: ric` gets the regional code (`aic.` for the Americas; cache: `aic.cdplauncher.lgtvcommon.com`, `aic-ngfts.lge.com`). The list includes the `us.` and `aic.` forms for every firmware name.
- The SDP server list can be refreshed from the server (sdx's `getConfig` cache), so new names can appear. Hosts files have no wildcards, so the router's parent-domain rules are what catch them.
- Left out on purpose: `api.amazon.com` and `oauth2.googleapis.com` (Prime Video and YouTube sign-in), `www.ueiwsp.com` (QuickSet), `lgtvonline.lge.com` (optional file).

## Local buffers

`wipe.list` (emptied each boot):

- **Ads/ACR:** `/mnt/lg/cmn_data/admanager/{cache,cookie,tmpData}`, `/mnt/lg/cmn_data/livepick/custom_db_save.db`, `/tmp/livepick`, `/tmp/livepick_nudge`, `/tmp/scd`, `/tmp/acr`, `/tmp/acr.xml`.
- **Usage/diagnostics:** `/mnt/lg/cmn_data/ucm/*_upload_time.txt`, `/var/log/uploadd`, `/var/spool/uploadd/{pending,uploaded}`, `/tmp/uploadd`, `/var/spool/crashreportd/pending`, `/tmp/crashreportd`, `/var/log/reports/librdx`, `/tmp/rdxd`, `/var/spool/rdxd`, `/tmp/nudgeReport.txt`, `/tmp/remotediag`.
- **Voice:** `/tmp/voiceinput_debug.pcm`, `/tmp/nlpmanager`, `/tmp/performer`, `/tmp/thinqai`, `/tmp/avs`, `/tmp/alexa_sdk.log`.

HBC already keeps `/tmp/rdxd`, `/tmp/uploadd`, `/var/spool/rdxd` and `/var/spool/uploadd/{pending,uploaded}` as empty read-only tmpfs.

Kept, owner's call:

- `/mnt/flash/data/prs/PRS_DB*.db`: watched history. prs is stubbed, so the files are inert. Deleting them is a one-off `rm`.
- `/mnt/flash/data/scd/fp`: scd fingerprints.
- `/mnt/lg/cmn_data/acr/data/*`: acr2's state, including `eula_allowed`.
- `/var/log/crashd`: local crash dumps, useful for debugging. Empty today.

## Dry run and baseline (2026-10-25 19:00 TV time)

`verify.sh` against the live TV: **49 FAIL, 8 WARN** (expected, since nothing is applied):

- hook not installed;
- running: acr2, livepick, scd-service, nlpmanager, nudge;
- no telemetry-off stubs (two foreign stubs over admanager and aiservice);
- hosts holds only HBC's four update names;
- `channelplus` on, `appUpdateMode` auto, all eight data agreements `true`;
- the LG flag files are missing;
- homekit listening on tcp/38496;
- **Netflix with a socket to 8.8.8.8:53**;
- six jail hosts copies without the blackhole.

The other sockets were LAN, loopback, or allow-listed listeners.

`install.sh --dry-run`: 636 names into hosts, 22 binds (2 skipped as foreign), `initctl stop nudge`, 5 kills, 2 settings and 8 agreement flags to flip, and 8 wipe targets. The output is in the report and reproducible with the command. The scratch copy in `/tmp` was removed. Afterwards `/tmp/telemetry-off*`, `/var/lib/telemetry-off` and `/var/log/telemetry-off.log` are all absent on the TV.

## Network-side verification (router), for the owner

The TV can't prove its own silence: anything that ignores `/etc/hosts` (Netflix's resolver, hardcoded IPs, the 10 s boot window) only shows up at the router.

### Before Phase 2: record ground truth (now, while internet is still blocked)

1. **Keep the TV's internet blocked**: a device rule "Block traffic from and to internet" on the TV, or keep it in a quarantine group. LAN access stays.
2. **Make the router the TV's only resolver.** The TV uses the DHCP DNS server, but Netflix queries `8.8.8.8` directly and `connmand` has `8.8.8.8` compiled in. Add rules for the TV: block TCP and UDP 53 and TCP 853 to every destination except the router's LAN address. If your router mode offers DNS interception or redirection for the device, enable it, so hardcoded resolvers are logged too.
3. **Turn on logging for the TV**: flow logging (Network Flows, including blocked flows), plus DNS query logging (the DNS / "Domain" view of the device's flows, or the box's DNS log if you use it).
4. Leave it **24 hours**, covering at least:
   - a cold boot (unplug for 30 s);
   - standby → on;
   - an hour on an HDMI input, an hour in the home screen, and opening the Content Store.

   acr2, nudge, user-context-manager and admanager fire on power and foreground events.
5. Export the queried names. Every LG-family name that isn't in `tools/telemetry-off/domains/` is a gap: add it to the right file before Phase 2.

### After Phase 2, still with internet blocked

1. Run `tools/telemetry-off/verify.sh`. It should report 0 FAIL, except the Netflix 8.8.8.8 socket if Netflix is preloaded (allow it with `ALLOW_REMOTE=8.8.8.8` only once rule 2 above is in place).
2. Repeat the 24 h capture. **Few DNS queries is not proof:** names the hosts file blocks never reach the router. The proof is **no flows to non-LAN addresses** other than the expected ones below. Any LG-family query that still appears is a name missing from the data files, or a query from the first ~35 s of boot.

### Allowing internet

Add these as **block** rules on the TV before allowing anything (wildcard / domain-and-subdomains rules):

- `lgtvsdp.com`, `nextlgsdp.com`, `tvsdp.lgeapi.com`, `lgeapi.com`
- `lgtvcommon.com`, `lgsmartad.com`, `lgsmartad.net`, `lgappstv.com`, `lgsmartplatform.com`
- `lgwebostv.com`, `lgecloudapm.com`, `lgtviot.com`, `lgthinq.com`, `wiselg.com`
- `alphonso.tv`, `lgads.tv`, `bidr.io`, `thetake.com`, `cjpowercast.com`, `lgechannel.com`
- the `*fts.lge.com` names from `60-lg-cdn.txt`, the `rone-*.lge.com` names, and `snu.lge.com`, `su.lge.com`, `su-ssl.lge.com`, `nsu.lge.com`
- IP **165.244.62.249**

Blocking `lgappstv.com` and `lgtvsdp.com` at the router breaks the LG Content Store and app updates. That is the price of the goal; drop those two rules if you want the store. Then allow internet.

**Expected and harmless:**

- DNS to the router.
- `lgtvonline.lge.com` (HTTP GET, connectivity check), unless you choose to block it (see open questions).
- The streaming apps you open (Netflix, YouTube, Prime, Disney+, Twitch, Emby), and their CDNs (`nflxvideo.net`, `googlevideo.com`, `cloudfront.net`, `akamaized.net`…).
- NTP (UDP 123) only if `AllowNTPTime` is ever enabled; it ships `false`, and the clock comes from the micom RTC.

**Failure, investigate:**

- any flow or query to the parents above, `*.amazon.com` voice endpoints (`alexa.*.a2z.com`), `embeddedassistant.googleapis.com`, or `165.244.62.249`;
- any flow to an IP with no DNS query before it (a hardcoded endpoint);
- DNS to any resolver except the router.

Keep logging for the first week online and repeat the cold-boot test after any firmware or app update.

## Corrections to earlier docs

- [startup.md](startup.md) suggested blocking on-demand services by bind-mounting over their `.service` file. On this firmware that doesn't work after boot. ls-hubd has already read the service directories, so the cached `Exec` still runs. live: livepick runs from ls-hubd with its `.service` masked by 50-custom-runtime, and scd-service relaunched mid-session. Also, `acr2`, `scd-service`, `admanager` and `remotediag` are registered in `/usr/share/dbus-1/system-services/`, not `luna-service2/services.d/` (commit 5d8df4b removed them from the config for that reason). Use the binary stub.
- `dpp` is Wi-Fi Easy Connect, not telemetry.
- `user-context-manager` is on the CEC keep-list, but it also uploads usage through sdx. Covered by the network block.

## Open questions for the owner

1. **User agreements:** withdraw the eight data-specific agreements from the kit (default `EULA=1`), or through Settings → User Agreements yourself (`EULA=0`)? Either way `generalTermsAllowed` stays on.
2. **SDP and Content Store:** block `lgtvsdp.com` / `lgappstv.com` (no LG store, app updates or LG account), or allow them and accept sdx's device-auth and EULA traffic?
3. **Connectivity check:** block `lgtvonline.lge.com` (`95-connectivity-check.txt`)? The TV would then report "no internet", and some apps may refuse to start.
4. **UEI QuickSet** (`www.ueiwsp.com`, `other.ueiEnable`): block and switch off? It names HDMI devices; CEC itself doesn't use it.
5. **50-custom-runtime:** remove its overlapping telemetry stanzas, and decide on its securitymanager no-op.
6. **Who else is changing the TV?** Stubs over admanager and aiservice and three settings flips appeared during this phase from another session. Phase 2 should start from a known state.
7. **Voice:** stubbing `voiceinput` disables the remote's mic button entirely. OK?
