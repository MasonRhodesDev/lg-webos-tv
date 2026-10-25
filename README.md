# lg-webos-tv

Field notes from poking at a rooted LG webOS TV over SSH: what it runs, why it looks busy, what hardware it exposes, and what is realistic to integrate with Home Assistant.

Scope: findings were taken on a **2019 LG B9 OLED** (board `M19_ATSC`, webOS TV 4.10.0, firmware 05.40.45, 4x Cortex-A53, 2 GB RAM), rooted with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel). Other models and firmware will differ.

## Setup

```sh
cp .env.example .env   # set TV_HOST (and TV_USER if you added one)
. ./.env
ssh root@"$TV_HOST" id
```

Homebrew Channel's dropbear accepts root by key. There is no `sudo`. `luna-send` is root-only and **prints nothing unless the session has a TTY**, so use `ssh -tt`:

```sh
ssh -tt root@"$TV_HOST" "luna-send -n 1 luna://com.webos.service.tv.systemproperty/getSystemInfo '{\"keys\":[\"modelName\",\"firmwareVersion\",\"sdkVersion\"]}'"
```

## Findings

| Topic | File | Status |
|---|---|---|
| Load average & memory | [docs/load-and-memory.md](docs/load-and-memory.md) | done |
| Sensors, microphone, Home Assistant options | [docs/sensors-and-mic.md](docs/sensors-and-mic.md) | done |
| Background / preloaded apps | [docs/background-apps.md](docs/background-apps.md) | done |
| Boot chain & upstart jobs | [docs/startup.md](docs/startup.md) | done |
| Boot trimming & custom firmware | [docs/boot-trimming.md](docs/boot-trimming.md) | done |
| Partition writes, restore & recovery | [docs/recovery.md](docs/recovery.md) | done |

All investigation so far was read-only: nothing on the TV was changed and no audio was recorded.

## Don't commit

Serial numbers, NDUID, MAC addresses, paired-device names, and the output of `voiceconductor/getVoiceKey` (LG voice auth keys). Keep host details in `.env`.
