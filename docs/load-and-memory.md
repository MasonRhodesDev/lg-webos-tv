# Load average & memory

Observed 2026-10-25, ~16–23 min after boot.

## Load ~11–15 is cosmetic

Linux load counts runnable **and** uninterruptible (D-state) tasks. Ten LG driver kernel threads sit permanently in D state:

`te_monitor`, `de_thread`, `card detection`, `LGDTV-PMDRV-TAS`, `smc_kthread`, `wdt-detect`, `AUD-KDRV-TASK`, `wdvb_resume_thr`, `pe_thread_m19`, `hdmi20_rx_video`

10 of those plus ~1 runnable task ≈ the load average. Meanwhile the CPU is 84–90 % idle with 0 % iowait:

```sh
ps -eo pid,stat,comm | awk '$2 ~ /^D/'
vmstat 2 4
```

Real CPU users are small: `tvservice` ~14 % of one core, `audpera` (realtime audio) ~10 %, then `WebAppMgr`, `dmr`, `cobalt` ~5 % each.

## Memory is fine (correction)

An earlier pass read "~45 MB free + swap in use" as memory pressure. It isn't:

- `/proc/meminfo` `MemAvailable` ≈ 449 MB (buffers + cache ≈ 390 MB, reclaimable).
- LG's memory manager: `luna-send -n 1 luna://com.webos.memorymanager/getCurrentMemState '{}'` → `"currentLevel":"normal","usable":694`.
- Swap is **zram** (`/dev/zram0`): `getUnitList` reports `zramOrig 151, zramUsed 33` — ~151 MB of swapped pages cost ~33 MB of RAM.
- Preloaded apps sit in the lowest kill-priority group (`PG_TYPE_BASE` / `UNIT_TYPE_PRELOAD` in `/etc/palm/memorymanager-conf.json`), so memchute closes them first when a launch needs memory.

Largest processes (RSS / PSS, MB):

| Process | App | RSS / PSS | Notes |
|---|---|---|---|
| `com.webos.app.inputcommon` | `com.webos.app.hdmi2` | 66.5 / 40.5 | the **foreground** HDMI input being watched |
| WAM browser + zygote | shared web runtime | 66.8 / 30.5, 28.0 / 8.7 | hosts all web apps |
| `com.webos.app.home` | launcher | 63.9 / 37.9 | core UI |
| `surface-manager` | compositor | ~59 RSS | core |
| WAM renderer | `airplay` | 42.9 / 23.4 (+16 swap) | preload, see below |
| `netflix.bin` | `netflix` | 40.9 / 33.8 | preload |
| `cobalt` | `youtube.leanback.v4` | 39.7 / 24.1 | preload |

See [background-apps.md](background-apps.md).
