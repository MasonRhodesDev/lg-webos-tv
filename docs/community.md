# Community projects for this TV

Survey of public projects relevant to a rooted 2019 B9 (webOS TV 4.10, M19A1) used as an HDMI monitor. Gathered 2026-10-26 from GitHub and the [webosbrew app repo](https://repo.webosbrew.org/api/apps.json). Stars and last-push dates are from that day.

## Rooting and recovery

| Project | What it does | Fit for this TV |
|---|---|---|
| [webosbrew](https://github.com/webosbrew) / [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) | The homebrew app store, root service, `startup.sh` and `init.d` hook | Installed. All community tooling builds on it. |
| [faultmanager-autoroot](https://github.com/throwaway96/faultmanager-autoroot) (★490) | Root exploit for webOS 4.0+, installs HBC | The current root route for 4.x. RootMyTV v1/v2 are patched. |
| [downgr8](https://github.com/throwaway96/downgr8) (★28) | Fakes expert mode so the USB updater accepts a downgrade or same version | Needed for slot revert or reflashing the same version (see [recovery.md](recovery.md)) |
| [epk2extract](https://github.com/openlgtv/epk2extract) (★447, active) | Unpacks LG EPK firmware | Unpack only, needs keys dumped from the TV, no repack |
| [openlgtv](https://github.com/openlgtv) | Community research hub and wiki (lxboot, NVM, debug modes) | Reference. Custom rootfs only exists for 2010–2011 sets. |
| [webos-kernel-drivers](https://github.com/throwaway96/webos-kernel-drivers) (★16) | Out-of-tree kernel modules for webOS kernels | Lists M16P3, so GPL kernel source exists for this platform |

## Custom kernels (kexec)

Both projects boot a custom Linux in RAM from a rooted stock system via `kexec`, leaving the signed boot chain untouched. Neither targets this SoC.

| Project | Target | State |
|---|---|---|
| [lg-webos-kexec](https://github.com/ggfuchsi-oss/lg-webos-kexec) (★9, 2026-08) | 50UP81009LR, Realtek RTD2875, webOS 6.5 | WIP. Reaches userspace. SoC watchdog reset found and patched from userspace (`/dev/mem` pokes). No display (tiled FBDC needs the video engine's RPC) and no networking yet. |
| [LG-TV-OSS](https://github.com/Pokropow/LG-TV-OSS) (★1, 2026-10) | OLED65C21LA (LG "O22" SoC) | Proof of concept. Boots Alpine via kexec. Solved the micom watchdog with a kernel patch. |

Takeaway for this TV: kexec is the only route to a different OS (see [custom-boot.md](custom-boot.md) Path C). The open problems are the same on every SoC: the watchdog/micom, the display pipeline and Wi-Fi. Nobody has done M19/M16P3 yet.

## Homebrew apps (webosbrew repo)

Relevant to monitor use or to what we found:

| App | What it does | Notes for this TV |
|---|---|---|
| [Life's Good Without Spying](https://github.com/lewisdoesstuff/lifesgoodwithoutspying) | Stops ad/ACR/telemetry/voice daemons, blackholes LG domains via `/etc/hosts`, bind-mounts inert stubs over the binaries so ls-hubd can't respawn them, re-applies from HBC `init.d` | **webOS 5+ only**, not listed for 4.x. It's the same "late overlay" pattern as Path B, and the closest existing implementation of the trimming in [boot-trimming.md](boot-trimming.md). A 4.x port would mostly need the daemon list checked. The README says it's largely AI-generated, so review before use. |
| [LG Input Hook](https://github.com/Simon34545/lginputhook) | Remaps remote buttons | Could map a key to an input switch |
| [Open Service Menu](https://github.com/Kzuismee/Open-Service-Menu) | Opens In-Start / EZ-Adjust over the current input | Lets you read the service menus without the service remote. Changing them is risky. |
| Bluetooth Disabler | Forces Bluetooth off | Optional trim |
| LG App Update Blocker | Stops forced app updates | |
| VNCServer, webOS Terminal | Screen sharing / on-TV shell | |
| [PicCap](https://github.com/drbeat/piccap) + [hyperion-webos](https://github.com/webosbrew/hyperion-webos) (★181) + Hyperion.NG / HyperHDR loaders | Screen capture → ambilight LEDs, can run fully on the TV | webOS 3.4+. HDMI input isn't DRM-blocked. Capture at 320×240. |
| Moonlight, IHSplay (Steam Link), Jellyfin clients, Kodi, RetroArch, YouTube AdFree | Apps | Not needed for monitor use |

## TV-as-monitor control (runs on the PC or server, no root needed)

| Project | Platform | What it does |
|---|---|---|
| [LGTV Companion](https://github.com/JPersson77/LGTVCompanion) (★1472) | Windows | Powers the TV on/off with the PC's power, sleep and idle state. Built for OLED burn-in protection. Needs network standby on. |
| [lgpowercontrol](https://github.com/bassidus/lgpowercontrol) (★45) | Linux | The same idea for Linux PCs |
| [ColorControl](https://github.com/Maassoft/ColorControl) (★1757) | Windows | LG TV settings and picture control alongside NVIDIA display settings |
| [bscpylgtv](https://github.com/chros73/bscpylgtv) (★367, active) | Python library / Home Assistant | Full SSAP control including picture/calibration settings and service-menu calls. Used by HA custom integrations. More than the built-in HA `webostv` integration. |
| Home Assistant `webostv` (built in) | HA | Power off, volume, input/app switching, toasts. Power-on needs Wake-on-LAN. |

All of these use the TV's standard SSAP/WebSocket API (ports 3000/3001, see [startup.md](startup.md)). Network standby is the usual trade-off for remote power-on.

## Gaps nobody covers

- Trimming boot itself: nobody has an early hook on webOS 4.x, which matches our lxboot findings.
- An ACR/ads-off app for webOS 4.x: the existing one targets webOS 5+.
- kexec on M19/M16P3.
