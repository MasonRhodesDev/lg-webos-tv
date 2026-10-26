# Path B: late overlay — custom runtime from HBC

Take control of the TV's runtime at ~35s via HBC init.d scripts. The stock boot runs unmodified through lxboot verification, kernel, upstart, and all service starts. At ~35s, HBC `startup.sh` fires and runs `/var/lib/webosbrew/init.d/*`. From that point, we own the runtime.

## What this gives you

- Kill unwanted services (telemetry, ads, voice, casting, preloads, updates)
- Bind-mount modified configs over stock ones (upstart jobs, settings, hosts)
- Replace securitymanager with a no-op (stop runtime partition verification)
- Run a custom GUI or launcher in place of the stock home/app stack
- Persistent across reboots (init.d scripts live on the writable data partition)

## What this doesn't give you

- Any control before ~35s — the stock LG splash and boot sequence runs in full
- Faster cold boot (16.5s to HDMI picture, 35s to HBC is hardware + verification + stock services)
- Modified kernel, rootfs, or bsppart (all signature-verified by lxboot)

## Mechanism

```
kernel → upstart → SetInitEnv → mount-bsp (pivot_root) → bootd
  → core-boot-done (15.7s) → ... → minimal-boot-done (19.7s) → ... → boot-done (34s)
  → HBC autostart activity fires (on core-boot-done)
  → startup.sh runs (~35s)
  → run-parts /var/lib/webosbrew/init.d (~35-37s)
  → OUR SCRIPTS RUN HERE
```

HBC's `startup.sh` uses `flock` + a marker file to run exactly once per boot. After its own setup (hosts block, SSH, telemetry spool neutering), it calls `run-parts /var/lib/webosbrew/init.d`.

`run-parts` runs scripts in lexical order. Filenames must match `[a-zA-Z0-9_-]` only (no dots). Scripts must be executable.

## Implementation

### Script: `/var/lib/webosbrew/init.d/50-custom-runtime`

```bash
#!/bin/sh
# Custom runtime overlay — runs at ~35s via HBC init.d

LOG=/tmp/custom-runtime.log
exec >>"$LOG" 2>&1
echo "=== $(date) ==="

# --- Phase 1: Kill unwanted services ---

# Telemetry / diagnostics (safe to stop)
for svc in rdxd uploadd crashreportd remotelogger contentminer dpp; do
    initctl stop "$svc" 2>/dev/null && echo "stopped $svc"
done

# Updates (already host-blocked by HBC)
for svc in update certupdmgr_timer; do
    initctl stop "$svc" 2>/dev/null && echo "stopped $svc"
done

# Voice / AI
for svc in voiceconductor voiceinput aiservice; do
    initctl stop "$svc" 2>/dev/null && echo "stopped $svc"
done

# Casting / discovery (keep if using AirPlay or DLNA)
for svc in dmr airplay-adaptor miracast ssdp-discovery-lgtv; do
    initctl stop "$svc" 2>/dev/null && echo "stopped $svc"
done

# BT audio (keep bluetooth-service if using BT remote)
for svc in btaudiosrc btaudiosnk wisa-manager asc; do
    initctl stop "$svc" 2>/dev/null && echo "stopped $svc"
done

# --- Phase 2: Neutralize securitymanager ---

# securitymanager has respawn — stopping it just restarts it.
# Bind-mount a no-op over the binary, THEN stop it.
# On restart, upstart runs the no-op.
cat > /tmp/securitymanager-noop <<'NOOP'
#!/bin/sh
exec sleep infinity
NOOP
chmod +x /tmp/securitymanager-noop
mount --bind /tmp/securitymanager-noop /usr/sbin/securitymanager
initctl stop securitymanager 2>/dev/null
# upstart respawns it → runs the no-op (sleeps forever, uses no CPU)
echo "securitymanager neutralized"

# --- Phase 3: Block ACR/ad on-demand services ---

# These are luna-service2 on-demand daemons, not upstart jobs.
# Block by bind-mounting over their service definition files.
mkdir -p /tmp/.empty-service
for svcfile in \
    /usr/share/luna-service2/services.d/com.webos.service.acr2.service \
    /usr/share/luna-service2/services.d/com.webos.service.livepick.service \
    /usr/share/luna-service2/services.d/com.webos.service.scd.service \
    /usr/share/luna-service2/services.d/com.webos.service.ad.service \
; do
    if [ -f "$svcfile" ]; then
        cp /dev/null /tmp/.empty-svc-file
        mount --bind /tmp/.empty-svc-file "$svcfile" && echo "blocked $svcfile"
    fi
done

# --- Phase 4: Kill preloaded apps ---

# These are low-priority preloads that consume RAM
for app in \
    com.webos.app.googleassistant \
    com.webos.app.airplay \
    netflix \
    cobalt \
; do
    luna-send -a com.webos.service.eim -n 1 \
        luna://com.webos.applicationManager/closeByAppId \
        "{\"id\":\"$app\"}" 2>/dev/null && echo "closed $app"
done

echo "=== custom runtime setup complete ==="
```

### What NOT to stop

These services are critical infrastructure. Stopping them causes boot loops, watchdog reboots, or a black screen:

| Service | Why it's untouchable |
|---------|---------------------|
| ls-hubd | IPC bus — its watchdog reboots the TV on failure |
| sam | System & Application Manager — launches the HDMI app |
| bootd | Boot orchestrator — stopping it halts the boot sequence |
| configd | Configuration service — everything reads from it |
| db8 (maindb, tempdb, mediadb, epgdb) | Database backend for all settings |
| tvservice, lginit_app | TV core — panel control, input routing |
| surface-manager, gm, WebAppMgr | Compositor + app runtime hosting HDMI input |
| inputcommon, home, fullhome | CRIU-restored apps — inputcommon IS the HDMI picture |
| audiod, pulseaudio, umediaserver | Audio pipeline |
| tvpowerd, sleepd | Power state management — gates the panel |
| oled-epl | OLED pixel protection — removing it risks burn-in |
| PmLogDaemon, PmKLogDaemon | Logging infra — other services depend on it |
| eim, physical-device-manager, lginput2 | HDMI-CEC (SIMPLINK) and input device path |

### Uncertain — test one at a time

| Service | Role | Risk |
|---------|------|------|
| tvrm, utp | TV resource manager, answers `getLastInput` | May be on the HDMI input path |
| MaliitServer, nudge | UI helpers (keyboard, notifications) | Unknown dependencies |
| iepg, rec-listmgr, rec-info-adapter | EPG/recording (unused on HDMI-only) | Probably safe |
| avahi-daemon, mdnsd | mDNS — needed for SSH `.local` resolution | Keep if using SSH by hostname |
| connman, wpa-supplicant | WiFi/networking | Keep for SSH access |

## Advanced: config overlays via bind-mount

Beyond killing services, you can replace their configuration:

```bash
# Example: replace bootd-mode.conf to skip loading unnecessary services
cp /etc/init/bootd-mode.conf /tmp/bootd-mode-custom.conf
# ... edit the copy to remove service starts ...
mount --bind /tmp/bootd-mode-custom.conf /etc/init/bootd-mode.conf
```

This doesn't help for services that already started (they're past their `start on` event by ~35s), but it does affect:
- Services that start on demand (luna-service2 daemons)
- Services that restart after being stopped (if their respawn hits the modified config)
- Any future `initctl reload-configuration` (though nothing triggers this post-boot)

## Advanced: custom GUI

The stock GUI is WebAppMgr running Luna Surface Manager compositing web apps. Options:

1. **Replace the home app**: Close the stock home, launch a custom web app via `luna://com.webos.applicationManager/launch`. HBC already demonstrates this — its app runs as a full web app. A custom home app would need to be registered as a luna service.

2. **Direct framebuffer**: The SoC has a Mali GPU with EGL/GLES. A native binary using EGL on the framebuffer device could bypass the web stack entirely. The bsppart provides `libEGL.so`, `libGLESv2.so`, `libMali.so`. This is heavy (cross-compile for ARM32 + Mali, manage display layers with surface-manager or replace it).

3. **Keep WebAppMgr, replace content**: The most practical option. Leave the compositor running, close stock apps, launch a custom web app that serves as the full-screen UI. The web app gets a Chromium-based renderer with full HTML5/CSS/JS.

## Quick Start+ interaction

Quick Start+ uses CRIU snapshot resume (p48). The snapshot is made during a special bootloader-driven "making" boot, and `md5sum -c` validated on resume.

If Quick Start+ is enabled:
- The CRIU snapshot restores services to their pre-suspend state
- HBC init.d still runs (it checks for the marker file, which doesn't survive the snapshot)
- Our kill/overlay script runs again, re-neutralizing services
- **Net effect**: faster "boot" (resume from snapshot), then our script runs at the same ~35s relative mark

Unknown: whether the snapshot captures the state AFTER our init.d runs (if the snapshot was made while our customizations were active) or the stock state (if snapshots are made during a clean boot). Testing needed.

## Persistence

All changes are persistent across reboots because:
- The init.d script lives on the writable data partition (`/var/lib/webosbrew/init.d/`)
- Bind-mounts are re-applied each boot by the script
- Service stops are re-applied each boot
- The underlying read-only rootfs is never modified

To revert: delete the init.d script and reboot. Everything returns to stock.

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Service dependency causes boot loop | Low | High | HBC failsafe mode catches crashes during startup; test changes one service at a time |
| ls-hubd watchdog triggers | Very low (don't touch ls-hubd) | High (reboot) | Never stop ls-hubd or its dependents |
| securitymanager no-op causes issues | Low | Medium | securitymanager's runtime check is sampling-based and only matters for snapshot-resume boots |
| Bind-mount target doesn't exist | None | None | Script checks with `[ -f ]` |
| HBC update overwrites startup.sh | Low | Low | Our script is in init.d, not startup.sh itself |
| init.d script has a bug | Medium | Medium | Failsafe flag trips after 10s of no crash; worst case = stock boot with failsafe toast |

## Next steps

1. Write and deploy the init.d script (start conservative — telemetry + voice only)
2. Test one service group at a time over SSH, verify stability across reboots
3. Add securitymanager neutralization once the kill list is stable
4. Experiment with custom web app as GUI replacement
5. Test Quick Start+ interaction with the overlay
