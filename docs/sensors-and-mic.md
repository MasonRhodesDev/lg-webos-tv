# Sensors, microphone & Home Assistant

Read-only survey, 2026-10-25. No capture device was opened.

## Verdict

**The TV body has no microphone.** The only mic is in the Magic Remote (MR19), which streams SBC audio over BLE **only while the mic button is held**. Nothing on the TV can act as an always-on mic.

## Inventory

| Sensor | Where | Evidence | Usable? |
|---|---|---|---|
| ALSA | card0 `lg115x`, `pcmC0D0p`..`D7p` | `/proc/asound/pcm`: all `playback 1`, no capture | output only |
| PulseAudio (9.0, system mode) | `/var/run/pulse/native` | `pactl list short sources`: 12 `.monitor` sources only | no mic |
| Built-in far-field mic | — | no capture PCM; audiod `voiceCommand/listScenarios` → `voice_command_back_speaker` only | absent |
| Magic Remote mic | BLE, `/usr/sbin/voiceinput` + `voiceconductor` | `strings voiceinput`: `CCaptureHidRaw`, `CSbcInterpreter`, `REPORT_ID_BLE_VOICE` | push-to-talk only |
| Magic Remote motion | `com.webos.service.mrcu` (`lginput2`) | `getMotionEngineStatus` → `useMotionEngine:true` | pointer only |
| Input devices | `/proc/bus/input/devices` | IR remote, M-RCU ×2, BT audio source; nodes group `composit` | key events readable as root |
| Ambient light | `luna://com.webos.service.tv.display/getLightSensorData` | returns `luminance 65535`; no IIO in kernel | unclear — 0xFFFF looks invalid; untested against room light |
| Camera | `/dev/video0`, `/dev/video1` | `/sys/class/video4linux/` empty (stale nodes); `CONFIG_USB_VIDEO_CLASS=y` | none (USB UVC would work) |
| USB | `/sys/bus/usb/devices` | root hubs + MediaTek `043e:3109` WiFi/BT combo | nothing attached |
| Bluetooth | MediaTek proprietary (`/dev/stpbt`, `btmtk_usb`) | no BlueZ/hci; `bluetooth2/adapter/getStatus` via luna | luna only |
| HDMI-CEC | LG proprietary (`/sys/class/lg/hdmi200`) | no `/dev/cec*` | via luna / HA `webostv` |
| Thermal / power | `/sys/class/thermal`, `/sys/class/power_supply` | empty | no |

### Mic internals

- `voiceinput` decodes BLE HID voice reports and hands them to `voiceconductor`/`nlpmanager` → ThinQ / Alexa / Google.
- It also has an ALSA path for **hot-plugged USB mics** (`CCaptureAlsa`, udev monitor). `/usr/share/voiceinput/preDefinedDeviceList.json` whitelists `1d6b:0101` and `1b6b:0104`, plus a "Dynamic Table".
- `voiceinput/startStreaming` / `stopStreaming` exist in the private ACL and likely stream over a local socket. **Not called** (state-changing, undocumented). Unknown whether it can open the remote mic without the button.

## Home Assistant options (ranked)

1. **Dedicated voice satellite near the TV** (ESPHome mic, HA Voice PE, or Pi + wyoming-satellite). No TV work, no blockers. Recommended.
2. **HA `webostv` integration** for the TV side: media_player (power off, volume, source/app), `notify` toasts, `webostv.button` / `webostv.command`, sound output. Power-on needs Wake-on-LAN. Exposes no mic or sensors. Pair with option 1 so HA hears you and the TV reacts.
3. **USB mic plugged into the TV.** Kernel has `CONFIG_SND_USB_AUDIO=y`; userland has `parec`, `pacat`, `nc`, `curl`, `gst-launch-1.0`, Python 2.7, Node 0.12. Blockers: no python3/ffmpeg (wyoming needs Python 3 → cross-compile for old aarch64 glibc), RAM already tight, `voiceinput` may claim the device, firmware updates/loss of root break it, and it's an always-listening mic on a box that already talks to cloud assistants.
4. **Hijacking the Magic Remote stream.** Push-to-talk only, private API, competes with LG's pipeline. Not worth it.
5. **Pulse `.monitor` sources.** Only carry what the TV is playing — not a mic.

## Security note

Root SSH by key is reachable from the LAN via Homebrew Channel's dropbear. Anyone with root can reach any audio device added to the box.
