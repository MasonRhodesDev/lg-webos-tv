# Background / preloaded apps

Read-only investigation, 2026-10-25 (~22 min uptime). Nothing was killed or reconfigured.

**Bottom line:** the TV isn't short on memory (see [load-and-memory.md](load-and-memory.md)). Disabling all four LG preloads would free ~95 MB PSS + ~17 MB zram. Optional, not needed.

## What's resident and why

Memory in MB from `/proc/PID/status` and summed `/proc/PID/smaps` (Pss, SwapPss), as root. App IDs from `applicationManager/running` and `memorymanager/getUnitList`; launch callers from `SAM NL_APP_LAUNCH_BEGIN` lines in `/var/log/messages`.

| Process | App ID | RSS / PSS / swap | Why resident | How to stop | Risk |
|---|---|---|---|---|---|
| `netflix.bin` | `netflix` | 40.9 / 33.8 / 0 | LG preload: caller `com.webos.service.preloadmanager`; policy `periodic`, `isPinUp:true` | preload-manager policy (below) | low — slower cold start |
| `cobalt` | `youtube.leanback.v4` | 39.7 / 24.1 / 0 | LG preload ~10 min after boot; policy `oneshot`, `semi-full` | preload-manager policy | low |
| WAM renderer + `/usr/sbin/airplay` + `homekit` | `airplay` | 42.9 / 23.4 / 18.4; daemon 11.8 / 4.0; homekit 5.9 RSS | **AirPlay preloads its own UI**: caller `airplay.service`; `libairplay-webengine.so.1` calls `setPreloadPolicy` with `isEnabled:true` at runtime (static files say `false`) | **TV Settings → AirPlay & HomeKit → off** (inferred to stop the self-enable; not verified live) | lose AirPlay; supported setting, survives updates |
| WAM renderer | `com.webos.app.googleassistant` | 30.6 / 12.9 / 3.3 | LG preload at +55 s; `periodic`, `isPinUp:true`; also `KeepOnLaunchEx` | preload policy; disabling GA in Settings may also work (unverified) | low–medium |
| WAM renderer | `org.webosbrew.hbchannel` | 42.8 / 23.8 / 3.7 | **not a preload** — opened by hand during the survey | close it | none |
| `com.webos.app.inputcommon` | `com.webos.app.hdmi2` | 66.5 / 40.5 / 14.6 | foreground input (`BootTimeApps`) | don't | — |
| `com.webos.app.home` | launcher | 63.9 / 37.9 / 3.7 | `BootTimeApps`, `KeepOnLaunchEx`, criu preload | don't | high |
| WAM browser / zygote | web runtime | 66.8 / 30.5 / 7.0; 28.0 / 8.7 / 3.7 | hosts web apps | shrinks if web preloads go | — |

Other policy entries cost no RAM: livetv, hdmi1/3/4, livemenu, fullhome use `preloadMode:"criu"` (checkpoint images on disk, `/var/log/*_criu_dump.log`). browser, tips, amazon, vudu, pooq are enabled but not running because `maxPreloadApp` is 4 (`service.config/getConfigs`) and the slots are full.

**Quick Start+ is off and not the cause:** `settingsservice/getSystemSettings '{"category":"option","keys":["quickStartMode"]}'` → `"off"`.

## How preloading works

- Daemon `/usr/bin/webos-preload-manager` (upstart `/etc/init/webos-preload-manager.conf`, respawn). Starts after `boot-done and memchute-ready and lsm-ready`, waits for CPU idle (`resourcemon`), ranks apps by usage (`usercontextmanager/getModeledRank`).
- Static policy: `/etc/configd/layers/{base,distro/hd2160-normal}/com.webos.service.preloadmanager.json`. `/` is a read-only overlay.
- Runtime policy: `luna-send -n 1 -f luna://com.webos.service.preloadmanager/getPreloadPolicy '{}'` — differs from static (netflix `false`, airplay `true`).
- Override paths in the binary (`strings`): `/var/preferences/webos-preload-manager-conf.json`, `/var/preferences/webos-preload-manager-debug-conf.json`, `/etc/palm/webos-preload-manager-m16p3-conf.json`; messages `"MaxPreloadApp is 0, Disabled"`, `"Preloading app is disabled at runtime"`. `/var` is rw ext4 and persists.
- Policy writers: `memchute`, `libairplay-webengine`, the preload manager itself. The `"permanent"` key suggests `permanent:true` persists a runtime change (unverified).

### Preloading disabled (2026-10-27)

The preload limit is a configd value, `com.webos.service.preloadmanager.maxPreloadApp`
(default 4 from `/etc/configd/layers/base`). Setting it through configd sticks:

```sh
ssh -tt root@"$TV_HOST" "luna-send -n 1 luna://com.webos.service.config/setConfigs \
  '{\"configs\":{\"com.webos.service.preloadmanager.maxPreloadApp\":0}}'"
initctl restart webos-preload-manager   # on the TV, to apply without a reboot
```

configd writes the value to `/var/preferences/configd_factory_db.json` and
lists it under `com.webos.service.config.usrDefined`. That is its store for
user-defined overrides, on the writable `/var`. To undo, set it back to `4`.

- **The file override does nothing.** `/var/preferences/webos-preload-manager-conf.json`
  with `setting.maxPreloadApp: 0` was ignored on the next boot, and the preload
  manager still launched Google Assistant, the browser, tips and livetv.
- **Verified on the running TV.** After the restart, `getPreloadPolicy` returns
  `{"applications":[]}`. No preload launches happened in about 10 minutes. Before
  the change there were six in the first two minutes after boot, then one every
  7–17 s in bursts.
- **This covers the apps the overlay kept closing.** Google Assistant came back
  about 54 s after boot as a preload. AirPlay re-enables its own preload policy at
  runtime, but with a limit of 0 there are no slots to fill.
- **Not yet verified:** that the value survives a cold boot, and that nothing is
  preloaded on the first boot after it.

### Open question

Netflix shows `isEnabled:false` in runtime policy yet was launched with `"reason":"preload"` (`PL=T`). Either the flag flips after a successful preload or something disabled it afterwards. Check `getPreloadPolicy` right after a reboot, before ~+62 s.

## Options (ranked, none applied)

1. **Do nothing** (or just close Homebrew Channel). Memory level is normal, preloads die first under pressure, zram is cheap.
2. **Turn AirPlay off in TV Settings** if unused — largest preload with swap counted; supported, no root, survives updates.
3. **`/var/preferences/webos-preload-manager-conf.json`** override: `"maxPreloadApp": 0` or per-app `isEnabled:false`. Survives reboots; factory reset wipes it. **Schema and precedence over configd unverified** — test one app, then check `getPreloadPolicy` + `getUnitList` after reboot. `maxPreloadApp: 0` may also stop the home/fullhome criu restores (slower launcher).
4. **Homebrew init.d bind-mount** of an edited `distro/hd2160-normal/com.webos.service.preloadmanager.json`. Survives reboots; fragile across firmware updates; lost with root.
5. **Not recommended:** runtime `setPreloadPolicy` with `permanent:false` / `setPreloadStatus` (lost on reboot), or killing processes (manager relaunches them).
