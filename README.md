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
| Custom boot paths (bsppart, env, kexec) | [docs/custom-boot.md](docs/custom-boot.md) | done; early hooks ruled out by lxboot analysis |
| Community projects | [docs/community.md](docs/community.md) | survey 2026-10-26 |
| Path C: kexec a custom kernel after the stock boot | [docs/path-c-kexec.md](docs/path-c-kexec.md) | researched read-only; stock kexec-tools, DTB and kdump kernel found; nothing staged or executed yet |
| Snapshot boot — fast resume into a custom runtime | [docs/snapshot-boot.md](docs/snapshot-boot.md) | researched read-only; p48 has a valid signed swsusp image; snapshot-boot-manager can sign from root; <5 s target |
| Partition writes, restore & recovery | [docs/recovery.md](docs/recovery.md) | done |
| Backup (`scripts/backup.sh`) & restore levels | [docs/backup-and-restore.md](docs/backup-and-restore.md) | backup done; restores untested |
| GUI catalog (webOS UI Atlas) | built by [tools/ui-atlas/](tools/ui-atlas/README.md) from a backup; published as a private artifact: <private-artifact> | v2; overlays reconstructed, with compositor screenshots beside them (kept out of git) |

All investigation so far was read-only: no settings on the TV were changed and no audio was recorded. The one exception is the UI Atlas screenshots, taken on 2026-10-25. Each overlay was opened, captured to `/tmp` and closed again, and the volume was raised by one step and set back. Every capture file was deleted afterwards. See [tools/ui-atlas/README.md](tools/ui-atlas/README.md#screenshots).

## Settings tool

Read and write luna settings from a JSON config, and push files to the TV:

```sh
cp tv-config.example.json tv-config.json   # gitignored — edit for your TV
scripts/tv-settings read                    # pull current TV values into tv-config.json
scripts/tv-settings diff                    # show what would change
scripts/tv-settings write                   # push settings to the TV
scripts/tv-settings push                    # push files from the "custom" section
scripts/tv-settings dump option picture     # dump raw luna categories
```

The `settings` section maps luna categories (`option`, `picture`, `sound`) to key-value pairs. The `custom` section defines files to push, services to stop (handled by the init.d script, not the tool directly), apps to close, and hosts to append.

## Don't commit

Serial numbers, NDUID, MAC addresses, paired-device names, and the output of `voiceconductor/getVoiceKey` (LG voice auth keys). Keep host details in `.env`.
