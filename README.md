# lg-webos-tv

Field notes and tools from a rooted LG webOS TV, worked on over SSH. The notes cover what the TV runs, why it looks
busy, how it boots, what it sends to LG, and how far it can be taken back. The tools take a full backup, turn LG's
telemetry and ads off, catalogue the stock UI, and load a UI layer of our own into LG's compositor.

It is for people who own a webOS TV, have rooted it, and want to understand or change it without bricking it. You
should be comfortable with a shell and SSH. Nothing here roots a TV; see [docs/community.md](docs/community.md) for
the projects that do.

## What you need

- **A rooted TV with [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel)** and root SSH by key.
  Homebrew Channel's dropbear provides it.
- **Ideally the same TV.** Every finding was taken on a 2019 **LG B9 OLED** (OLED55B9PUA, board `M19_ATSC`, webOS TV
  4.10.0, firmware 05.40.45, 4x Cortex-A53, 2 GB RAM). Other models and firmware will differ. The tools check what they
  can, but paths, service names and settings keys change between firmware versions.
- **On your computer:** `bash`, `ssh` and `scp`, `awk`, and:
  - `node` for `scripts/tv-settings`, `scripts/install` and `tools/theme-pack/`;
  - `jq` and `sha256sum` for `scripts/backup.sh`;
  - GNU `tar` for `tools/telemetry-off/`;
  - `python3` 3.8 or later for `tools/ui-atlas/`;
  - optionally, Qt 5's `qml` and `qmltestrunner` plus Xvfb, for the theme-pack's QML tests and preview renders.

## Safety

Root on a TV can brick it. Read [docs/recovery.md](docs/recovery.md) before you write anything. In short, a TV that
still boots can be put back from software, but **a TV that doesn't boot can only be recovered by programming its
eMMC directly** (ISP or chip-off). On webOS 4+, the bootloader's DEBUG mode can't be turned on once the TV no longer
boots.

- **Take a backup first.** `scripts/backup.sh` reads every partition and the live settings without writing to the
  TV. See [docs/backup-and-restore.md](docs/backup-and-restore.md). Its output holds your secrets, so keep it out of
  any git repository.
- **Close the open root shell.** A freshly rooted TV runs a root telnet with no password on the LAN until you turn
  it off ([docs/startup.md](docs/startup.md#security-findings)).
- **Read-only:** `scripts/backup.sh`, `scripts/cold-boot-verify`, `scripts/tv-settings read`, `diff` and `dump`,
  `tools/telemetry-off/verify.sh`, and `tools/ui-atlas/` (it works on a backup, off the TV).
  `tools/telemetry-off/install.sh --dry-run` copies the kit to `/tmp` on the TV, prints what it would do, and
  deletes it.
- **Writes to the TV:** `scripts/tv-settings write` and `push`, `scripts/install`, `tools/telemetry-off/install.sh`,
  and the theme-pack's installers. Everything they write lands on the data partition (`/var`, settings and Homebrew
  Channel's `init.d` hooks). None of them writes a firmware partition, and each has a way back:
  - `scripts/install --remove`, then a reboot;
  - `tools/telemetry-off/uninstall.sh`, which reverts live;
  - for a bad boot hook, Homebrew Channel's failsafe: after a crash during startup, the next boot skips the hooks
    and starts only a root telnet ([docs/startup.md](docs/startup.md#boot-chain)). Whether that still happens once
    you have turned telnet off is unverified ([docs/recovery.md](docs/recovery.md)).

## Setup

```sh
cp .env.example .env   # set TV_HOST to your TV's address (and TV_USER if you added one)
. ./.env
ssh root@"$TV_HOST" id
```

`.env` is gitignored. Every script reads `TV_HOST` and `TV_USER` (default `root`) from it or from the environment.

There is no `sudo` on the TV. `luna-send` is root-only and **prints nothing unless the session has a TTY**, so use
`ssh -tt`:

```sh
ssh -tt root@"$TV_HOST" "luna-send -n 1 luna://com.webos.service.tv.systemproperty/getSystemInfo '{\"keys\":[\"modelName\",\"firmwareVersion\",\"sdkVersion\"]}'"
```

## Findings

Dates are when the observation was made, on the TV described above.

| Topic | File | Status |
|---|---|---|
| Load average & memory | [docs/load-and-memory.md](docs/load-and-memory.md) | done |
| Sensors, microphone, Home Assistant options | [docs/sensors-and-mic.md](docs/sensors-and-mic.md) | done |
| Background / preloaded apps | [docs/background-apps.md](docs/background-apps.md) | done |
| Boot chain, upstart jobs, security holes after rooting | [docs/startup.md](docs/startup.md) | done; telnet fix and ACR/ads block applied |
| Boot trimming & custom firmware | [docs/boot-trimming.md](docs/boot-trimming.md) | done: trimming can't make the picture appear sooner |
| Custom boot paths (bsppart, env, kexec) | [docs/custom-boot.md](docs/custom-boot.md) | done; early hooks ruled out by lxboot analysis |
| Path B: take over the runtime from Homebrew Channel's hook | [docs/path-b-late-overlay.md](docs/path-b-late-overlay.md) | in use on the test TV |
| Path C: kexec a custom kernel after the stock boot | [docs/path-c-kexec.md](docs/path-c-kexec.md) | researched read-only; nothing staged or executed |
| Snapshot boot: fast resume into a custom runtime | [docs/snapshot-boot.md](docs/snapshot-boot.md) | ruled out by design |
| Community projects | [docs/community.md](docs/community.md) | survey, 2026-10-26 |
| Telemetry off (inventory, kit, router checks) | [docs/telemetry.md](docs/telemetry.md) | applied on the test TV 2026-10-26; a standby wake and a by-eye HDMI/CEC check are still open |
| Partition writes, restore & recovery | [docs/recovery.md](docs/recovery.md) | done |
| Backup & restore levels | [docs/backup-and-restore.md](docs/backup-and-restore.md) | backup done; restores untested |
| Loading our UI into the running compositor; what carries over from newer webOS | [docs/home-takeover.md](docs/home-takeover.md) | working on the TV: no restart, no blank screen |
| A Home of our own (a dock over the picture, on the Home key) | [docs/home-dock-plan.md](docs/home-dock-plan.md) | designed and checked against the TV; not built |
| Making a theme or a style | [docs/theme-making.md](docs/theme-making.md) | guide; needs no TV |
| Design of the UI layer | [docs/design/README.md](docs/design/README.md) | what the design covers and where it lives in code |

## Tools

| Tool | What it does | Touches the TV | Status |
|---|---|---|---|
| [scripts/backup.sh](scripts/backup.sh) | Full read-only backup: partitions, settings, runtime state | reads | done |
| [scripts/tv-settings](scripts/tv-settings) | Read, diff and write luna settings from `tv-config.json` | reads; `write` and `push` write | working |
| [scripts/install](scripts/install) | Installs [scripts/50-custom-runtime](scripts/50-custom-runtime), a boot hook that trims LAN and casting services and closes preloaded apps, then applies the settings | writes | in use on the test TV |
| [scripts/cold-boot-verify](scripts/cold-boot-verify) | After a cold boot, checks that the hooks this repo installs actually ran | reads | working |
| [tools/telemetry-off/](tools/telemetry-off/README.md) | Stops LG's telemetry, ACR, ads and voice services at boot, blackholes LG's domains, withdraws the data agreements | writes; `verify.sh` reads | applied on the test TV |
| [tools/theme-pack/](tools/theme-pack/README.md) | Our QML UI layer in LG's compositor: a component kit, Smoke and Bubble styles, Glow, Winter and Halloween themes, our Settings and its Look page, the Look service, tests and a preview harness | writes | built and tested off the TV; [TV-CHECKS.md](tools/theme-pack/TV-CHECKS.md) lists what the TV must still confirm |
| [tools/ui-atlas/](tools/ui-atlas/README.md) | Builds a browsable catalogue of the stock UI (apps, overlays, assets) from your own backup | no; works on a backup | v2. The output holds LG's files, so it stays on your machine |

### Settings tool

`scripts/tv-settings` reads and writes luna settings from a JSON config, and pushes files to the TV. The example
config holds one TV's picture and option values, so **read your own TV's values first**, then change only what you
mean to:

```sh
cp tv-config.example.json tv-config.json   # gitignored
scripts/tv-settings read                    # replace the example's values with your TV's
scripts/tv-settings diff                    # after editing: show what would change
scripts/tv-settings write                   # push settings to the TV
scripts/tv-settings push                    # push files from the "custom" section
scripts/tv-settings dump option picture     # dump raw luna categories
```

The `settings` section maps luna categories (`general`, `option`, `picture`, `sound`) to key-value pairs. The
`custom` section names files to push, services the boot hook stops, apps it closes, and hosts to append.
`scripts/install` pushes the boot hook and then runs `write`; `scripts/install --dry-run` shows both steps without
writing.

## Don't commit

Serial numbers, NDUID, MAC addresses, paired-device names, the names you gave your inputs, and the output of
`voiceconductor/getVoiceKey` (LG voice auth keys). Keep host details in `.env`. Keep backups, firmware images and
anything copied off the TV out of the repository: they hold your secrets and LG's copyrighted files.

## License

GPL-3.0-or-later; see [LICENSE](LICENSE). The fonts under `tools/theme-pack/packs/fonts/` are under the SIL Open Font
License, with each font's `OFL.txt` beside it. Part of `tools/telemetry-off/` is adapted from
[Life's Good Without Spying](https://github.com/lewisdoesstuff/lifesgoodwithoutspying) under the MIT licence; its
notice is in [tools/telemetry-off/README.md](tools/telemetry-off/README.md). Nothing of LG's is in this repository:
the tools read LG's files from your own TV or your own backup.
