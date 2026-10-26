# telemetry-off

Switch off LG telemetry, ads, ACR and voice uploads on a rooted LG webOS TV 4.x, down to the running services. A Homebrew Channel `init.d` hook re-applies it every boot.

Built and verified against webOS TV 4.10.0 / firmware 05.40.45 (2019 B9). On other firmware, targets that don't exist are skipped. Re-check `targets.tsv` against your rootfs before trusting it. The full inventory, evidence and change list are in [docs/telemetry.md](../../docs/telemetry.md).

**The TV-side kit is defence in depth.** It runs ~35 s after power-on, after LG's daemons and the network have started. Block the domains at your router too ("Network-side verification" in the doc).

## What it does each boot

1. **Hosts blackhole.** It writes the current `/etc/hosts` (keeping Homebrew Channel's update block) plus every name in the enabled `domains/*.txt` files, and bind-mounts the result over `/etc/hosts`.
2. **LG's own off-switch flags.** It creates `crashreportd_disabled` and `voice_server_sync_disabled`.
3. **Targets** (`targets.tsv`), blocked according to how each one starts:
   - **Upstart jobs:** an `exit 0` stub is bind-mounted over the binary, then `initctl stop`.
   - **ls-hubd on-demand services:** an empty file is bind-mounted over every copy of the `.service` file, then `SIGHUP` to ls-hubd to rescan, then the running instance is killed. Calls then fail fast with "Service does not exist". A binary stub there would hang callers for 300 s.
   - **securitymanager:** gets a sleeping stub. That turns off runtime partition verification and the device-ID service.
4. **Settings.** It re-asserts `settings.tsv` and withdraws the data-specific user agreements (`EULA_KEYS`). It only writes values that differ, and saves the old ones.
5. **Buffers.** It empties the paths in `wipe.list`.

The kit lives in `/var/lib/telemetry-off/`, writes its state to `state/` there, and logs to `/var/log/telemetry-off.log`.

## Requirements

- **Dev box:** `bash`, `ssh`, GNU `tar` (for `--owner=0`), `awk`.
- **TV:** Homebrew Channel with SSH, root, and busybox with `timeout -t`, `script`, `luna-send`, `initctl`. `install.sh` checks these.

Set `TV_HOST` (and optionally `TV_USER`, default `root`) in the environment or in the repo's `.env` (see `.env.example`).

## Use

```sh
tools/telemetry-off/verify.sh            # read-only report; exit 1 on any FAIL
tools/telemetry-off/install.sh --dry-run # copy to TV /tmp, print what apply would do, delete
tools/telemetry-off/install.sh           # install; applies at next boot
tools/telemetry-off/install.sh --apply-now
tools/telemetry-off/uninstall.sh         # revert live (no reboot), then remove
```

On the TV:

```sh
sh /var/lib/webosbrew/init.d/80-telemetry-off status
sh /var/lib/webosbrew/init.d/80-telemetry-off revert   # undo now; sets the off switch
sh /var/lib/webosbrew/init.d/80-telemetry-off enable   # clear the off switch
touch /var/lib/telemetry-off/disabled                  # off switch: next boot is a no-op
```

Edit `/var/lib/telemetry-off/telemetry-off.conf` on the TV to choose domain files, target groups, and whether settings, agreements, flags and wipes are applied.

## Safe failure

- No `set -e`. Each step runs in its own subshell, so a failure is logged and the next step runs.
- Never touches dropbear/SSH, connman, Wi-Fi or interfaces.
- Every `luna-send` is bounded by `timeout -t 5`.
- If a previous run never finished (the TV died mid-apply), the next boot sets the off switch and does nothing. Homebrew Channel's own failsafe covers the boot in between.
- `revert` undoes only what is recorded in `state/`, and only removes a mount when the kit's own stub or marker is on top.

## Files

| File | Purpose |
|---|---|
| `telemetry-off.sh` | the on-TV script (installed as `init.d/80-telemetry-off`; `run-parts` needs a dot-free name) |
| `targets.tsv` | daemons to stub/stop, by group |
| `settings.tsv` | settings to re-assert |
| `wipe.list` | buffers to empty |
| `domains/*.txt` | hosts blackhole, one category per file, with sources |
| `telemetry-off.conf.example` | config defaults |
| `listen-allow.txt` | listening sockets `verify.sh` accepts |
| `install.sh`, `uninstall.sh`, `verify.sh`, `common.sh`, `verify-remote.sh` | dev-box side |

## Credits

The stub-and-kill method and part of the domain lists come from [Life's Good Without Spying](https://github.com/lewisdoesstuff/lifesgoodwithoutspying) by Lewis Wood, MIT licence (commit 8c42711). Reused lists are marked `[lgws]` in each domain file. LGWS targets webOS 5+. The daemon list here was rebuilt for webOS 4.x, and many LGWS names don't exist on it.

MIT License, Copyright (c) 2026 Lewis Wood, for the reused material:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
