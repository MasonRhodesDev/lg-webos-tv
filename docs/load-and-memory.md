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

## Memory is the real constraint

~1.6 GB visible to the kernel, ~26–45 MB free, ~470 MB available, 120–165 MB in swap. Largest resident processes:

| RSS | Process |
|---|---|
| ~67 MB | `WebAppMgr` (several instances, 30–67 MB each) |
| ~64 MB | `com.webos.app.i*` |
| ~64 MB | `com.webos.app.h*` |
| ~59 MB | `surface-manager` |
| ~45 MB | `scd-service` |
| ~40 MB | `GIBBON_MAIN` (Netflix, preloaded) |
| ~40 MB | `cobalt` (YouTube, preloaded) |

```sh
ps -eo rss,user,comm --sort=-rss | head -12
```

See [background-apps.md](background-apps.md) for why these stay resident.
