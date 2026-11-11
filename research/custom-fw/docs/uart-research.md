# LG B9 OLED (OLED55/65B9, M19_ATSC, LG1314/M19A1, webOS 4.10.0 fw 05.40.45) — hardware-access research

Scope: The owner already has HBC root over SSH on this exact set. The question is what lies **below** webOS — serial console, bootloader lock, eMMC recovery, secure-boot, and the state of community projects that touch any of those — and, after the mid-task scope expansion, what the path looks like if we **wipe webOS userland wholesale and run a minimal panel** (Chromium-kiosk / Weston / kexec'd Alpine).

Confidence tags: **H** = tested on B9 or at least an M19 OLED; **M** = adjacent LG OLED / same SoC family (C9/E9, LX M16P3 siblings); **L** = general webOS/LG lore, no specific model evidence.

All sources dated at point of retrieval (2026-11-04). Nothing newer than ~2025-08 was found for the deeper hardware topics; the research-heavy field is small (a handful of people around throwaway96 / webosbrew / openlgtv).

---

## 1. UART / serial console on the B9 mainboard

**Nobody has published a photographed B9-specific UART pinout.** The only substantive public write-up is throwaway96's living gist "LG TV serial / debug" (https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1), which is a cross-model guide and does **not** name the B9 or the M19 chassis anywhere in the body. Treat everything below as the generic LG-OLED recipe applied to B9 by extrapolation (**M**), not a verified B9 map.

### Connector form-factor (M, extrapolated from the gist)
Quoting the gist: "most will have a 3.3V UART edge connector… other options are an RS-232 DE-9 connector or 3.5mm jack 'if present,' a '4-pin wafer connector,' and test pads on the bottom of the board."

On 2018–2019 LG OLEDs (C8/E8/B8/C9/E9/B9) community reports consistently describe a **4-pin edge connector** on the main board. The B9 65" main board is LG PN `EBT65973007` / PCB `EAX68784904(1.0)` (ShopJimmy listing, https://www.shopjimmy.com/lg-ebt65973007-main-board-for-oled65b9pua/, undated). No teardown with a labelled debug header is published for this PN; I could not confirm whether the 4-pin edge is populated or must be hand-tacked.

### Pin order (M)
Per the gist, for the edge connector: **pin 1 +3V3, pin 2 RX, pin 3 GND, pin 4 TX**. Guidance quoted verbatim: *"don't connect +3V3. Connect GND, RX, and TX, with RX and TX swapped relative to your adapter."* Each data line has a 100 Ω series resistor; the RX line is pulled up to 3.3 V with a 10 kΩ resistor. Adapter must be strapped to **3.3 V logic** — a 5 V adapter will likely cook the SoC pin.

Warning worth copying into any physical-work plan: do **not** apply the TV's +3V3 pin to your adapter, and tie grounds before data.

### Baud / framing (M)
Gist: default is *"in practice 9600,"* though "some bootloader code" uses 115 200. Format is 8N1. The in-TV path to enable UART is the service (Instart) menu: *System 1 → set baud*, then *System 2 → RS-232C Control = On*.

### Is serial exposed before you enable DEBUG? (M → likely No for B9)
Gist: *"serial access requires DEBUG."* DEBUG is enabled by flipping the NVM byte at offset `0x1a1` from 5 (RELEASE) to 3 (DEBUG). On webOS **4 and newer**, DEBUG cannot be enabled if the system does not currently boot (downgr8 README, https://awesome.ecosyste.ms/projects/github.com%2Fthrowaway96%2Fdowngr8). Since the B9 is webOS 4.5, this means: **UART almost certainly stays silent on a stock RELEASE B9 until you've already enabled DEBUG from a rooted userland**. That matches the repo's prior finding that lxboot is locked in RELEASE/debugMode=5 — I did not find community evidence contradicting it. (**M**, consistent with gist, but no B9-specific capture confirms the bootloader stays silent — nobody has posted a scope trace of B9 boot output.)

### U-Boot / lxboot prompt interruption (L for B9, M generally)
No public report shows an interactable lxboot prompt on an M19 OLED. The gist says DEBUG unlocks *"access to the bootloader console and debug menus via serial"* but gives no key sequence and no B9 transcript. The downgr8 README phrases bootloader recovery as a conditional: *"it may be possible to recover a non-booting TV if you can get into the bootloader (U-Boot or lxboot), and bootloader access requires that the TV be in DEBUG mode."* Also from throwaway96: *"lxboot is not open source, so the GPL package for LX SoC models doesn't provide the partition offset information that other models have."*

**Net:** Owner's prior read is corroborated — lxboot on RELEASE B9 is effectively a dead end, and promoting to DEBUG currently requires a working rooted userland. UART is useful once rooted (kernel log, post-boot console, running shell over wire), **not** as an independent recovery lever.

### Root shell over the UART (M)
Gist, on how to get a prompt once UART is live: *"From the serial debug menu you can spawn a root shell. Press F9 and use `sh`. On newer models, you may need to press `s`."* It also flags that some LX SoCs — the M16/M16P/M16P3 family specifically appears in the restricted list — *"prohibit access to certain debug menu commands… including shell access without AccessUSB authentication."* The B9's LG1314 is marketed as the Alpha 7 Gen2 and is part of this LX LG1k series. **Shell access over UART on B9 may require AccessUSB keying** that throwaway96 explicitly says he cannot help with (**M**, borderline evidence; this is the biggest hardware uncertainty).

### Photos / board diagrams
None found. ShopJimmy and similar parts resellers only show overviews; no annotated debug-pin photo for the B9 65" or 55" board in any forum search. iFixit has no B9 teardown. OpenLGTV wiki pages for this chassis were not retrievable from search.

---

## 2. eMMC / SPI chip-off recovery

### Chip
Samsung eMMC (confirmed in the owner's repo notes; no public source adds a part number). On 2019 LG OLED mainboards this is overwhelmingly a BGA-153 or BGA-169 eMMC, not an EMCP (RAM-on-package); the 2 GB DRAM on B9 sits as separate packages next to the SoC. ISP test pads for CLK/CMD/DAT0 are standard practice on LG boards but their location on `EAX68784904` is not published — a chip-off job on B9 starts with your own photos (**L**).

### Programmer options (L; nothing B9-specific found)
Community eMMC recovery guidance for LG TVs (Rossmann writeup https://rossmanngroup.com/services/emmc-data-recovery, DEF CON 33 "eMMC BGA Secrets" workshop PDF https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20workshops/DEF%20CON%2033%20-%20Workshops%20-%20Patrick%20Kelly%20-%20EMMC%20BGA%20Secrets.pdf) consistently names the same hardware ecosystem:
- **RT809H** — the cheapest good-enough choice for one-off TV eMMC jobs; universal adapters cover BGA-153/169.
- **Easy-JTAG Plus / Easy-JTAG Pro** — the serious choice; supports ISP and chip-off, has LG-TV profiles in its drop-down menus.
- **Medusa Pro / Medusa Pro II** — equivalent class; preferred by phone shops, works fine for TV boards.
- **UFI Box** — eMMC-only, bit cheaper than Easy-JTAG, well-regarded for chip-off reads.
- Generic BGA-153/169 socketed "reader" boards + a CH341 or an SD-card-adapter-plus-reballing kit — the ultra-cheap route, fiddly, works.

Reballing caveat (DEF CON 33 workshop): if **DAT0, CLK, or CMD** pads crater on removal, the chip is unusable even in a socket. TVs can tolerate this better than phones because you can replace a corrupted TV eMMC with a known-good one and re-flash — provided you have a full partition dump.

### Partition data to flash back (M)
downgr8 README notes that **partition data files can be extracted from firmware images using epk2extract** (openlgtv/epk2extract on GitHub). The important wrinkle for B9: *"you should not install any firmware that doesn't match your TV's OTAID."* and *"USB rather than NSU images whenever possible, because NSU images often do not contain data for all of the TV's partitions."* So the practical recovery kit is: epk2extract + the exact OTAID-matched **USB** EPK for `OLED55B9PUA` / `OLED65B9PUA` on firmware 05.40.45, pre-extracted into per-partition raw images.

---

## 3. Secure boot on this exact firmware (05.40.45, LG1314 / M19A1)

**No public work has broken the LG1k secure-boot chain below the lxboot level on any M19 OLED.** Everything today sits above the kernel, exploiting webOS-layer services. Specifically:

- `downgr8` (https://github.com/throwaway96/downgr8, last push March 2024) — described by its author in issue #4 as "doesn't even enable expert mode in the update service… users would need to make the Luna calls themselves, and that the tool hasn't really been tested." It is a **privileged launcher** for the OEM expert-mode UI, not a signature bypass. You still need a signed EPK (**M**).
- `faultmanager-autoroot` (throwaway96, https://github.com/throwaway96/faultmanager-autoroot) — abuses a faultmanager bug (buglloc) to get root on webOS 4.0 through 10.0. It's a **post-boot userland exploit**, does not touch the bootloader (**H**, applicable).
- `dejavuln-autoroot` (throwaway96, https://github.com/throwaway96/dejavuln-autoroot) — userland exploit via crafted MP3 + Music app, covers webOS **3.5 to 8.x**. Does not touch secure boot (**H**, applicable to webOS 4.5 B9).
- `RootMyTV` v1/v2 — superseded; its CVEs were patched by LG mid-2022; still works on firmware older than that threshold.

**Lowest lever currently published** for this exact TV is the `downgr8` + expert-mode route: you use a HBC-rooted shell to launch LG's own expert update UI, which will then accept any **signed** EPK whose OTAID matches the TV. There is no known public signing-key leak for M19 OLEDs; no known glitch, downgrade-attack, or fault-injection write-up against LG1k secure boot of any kind (**L** — I can only say "not found", not "does not exist"). The openlgtv Discord has been the center of this conversation and may have unpublished progress; I did not have access to it.

Confirmation of the owner's prior read: **yes, downgr8 + expert mode is still the only lever above the bootloader**, and **nobody has published a lower one** for B9/M19.

---

## 4. Community-project status (as of search date 2026-11-04)

Dates refer to last meaningful activity I could see from search snapshots and awesome.ecosyste.ms indices; nothing I found dates past **mid-2025**. Owner should spot-check each repo's "Insights" page for post-2025-08 commits.

| Project | Owner | Status / applicability to B9 webOS 4.5 fw 05.40.45 |
|---|---|---|
| **RootMyTV v1/v2** | RootMyTV / throwaway96 fork | **Deprecated for modern firmwares.** The patch-notice README (throwaway96/RootMyTV.github.io `patch-notice2-20231216`) states RootMyTV is unlikely to work on firmware released since mid-2022. The vulnerabilities used by RootMyTV were patched by LG. Still fine on fw dated before that, which 05.40.45 may or may not be — the owner needs to check CanI.RootMy.TV. **M**. |
| **faultmanager-autoroot** | throwaway96 (created 2025-01-05) | *"Vulnerability is present in webOS 4.0 through 10.0."* Author as of 2025-08-24: *"I haven't seen any patched webOS 4.5 firmware yet."* No webOS 4.5 patch known. **Likely usable on 05.40.45**, confirm on CanI.RootMy.TV. **H** (in-range version). |
| **dejavuln-autoroot** | throwaway96 | Targets webOS **3.5 to 8.x**. webOS 4.5 is in range. Does not work on 2016 and earlier. Exploits a crafted MP3 played from USB via the Music app, requires LG Developer Mode uninstalled first, FAT32/NTFS USB. webosbrew.org/guides/rooting/dejavuln is the user-facing writeup. **H**. |
| **openlgtv.org wiki / openlgtv org** | openlgtv | **Primarily Broadcom 2010–2011 sets** (per Gigazine 2021-11-26 writeup). Does not publish a webOS-4.x OLED rootfs. Discord is where live help happens. **L** for B9 relevance. |
| **webosbrew / Homebrew Channel** | webosbrew | Alive. HBC v0.7.2 current; B9 is a supported target once rooted. `webos-bridge-64to32` lets aarch64 binaries run on webOS. **H**. |
| **LG-TV-OSS** | — | No fresh search hits past 2023. No M19 progress visible. **L**. |
| **lg-webos-kexec** | — | No search hits at all. Could not confirm the repo still exists under the openlgtv or throwaway96 orgs via search. If owner has a URL, worth re-checking by hand. **L** → effectively **no known public M19 kexec progress**. |
| **throwaway96/webos-kernel-drivers** | throwaway96 | Active. Ships out-of-tree kernel modules keyed by kernel version + SoC family. Supported SoC list explicitly includes **M14, H15, M16, M16P, M16PP, M16P3, M23, O18, O20, O20N, O22, O22N, O22N2, O22N3, O24, O24N**. **M19 is not in the list.** The repo covers mostly serial drivers and loads them via HBC. **M** — adjacent, not B9. |
| **downgr8** | throwaway96 | Expert-mode launcher, not a signature bypass (see §3). Needs HBC-level root. **H**. |

**Note on the B9 and "M16P3":** throwaway96's SoC list has M16P3 (older Alpha 7 Gen1 class, 2018 OLEDs like B8) but does **not** have M19. Owner's label "M19A1 / M16P3 family" bundles two generations; strictly, M16P3 ≈ 2018, M19 ≈ 2019 B9. Projects that say "works on M16P3" need an extra hop of validation on M19.

---

## 5. Scope-expansion topics (replace userland wholesale)

The scope-expansion message asked me to research five topics that are a step beyond the owner's original brief. I did, and the honest finding is: **outside blocking telemetry on stock webOS, almost nothing has been publicly shipped.** Details below so the owner can plan rather than discover.

### 5.1 Replacing webOS userland on a webOS 4.x OLED
- **OpenLGTV custom rootfs is Broadcom-2010/2011 only** (Gigazine 2021-11-26; no new activity since). It does not apply to M19. **L**.
- **webOS OSE flashing to a retail LG TV: impossible** per the webOS OSE forum (`forum.webosose.org/t/can-i-flash-webos-ose-to-my-lg-smart-tv/1738`). That is one forum reply, but no counter-evidence exists. **M**.
- **Buildroot/Yocto/Alpine-on-webOS-via-kexec:** no public project found beyond `webos-kernel-drivers` (out-of-tree modules for webOS kernels, not a Linux image). No search result for "lg-webos-kexec." No Alpine-on-LG-TV writeup exists. **L**.
- **Chromium-kiosk or minimal-panel on a rooted B9:** no writeup found. The closest is that HBC + `webos-bridge-64to32` already lets you run arbitrary aarch64 ELFs, which includes a cross-compiled Chromium-kiosk-style process, but there is no prior art for having it replace `surface-manager` / `sam` / WAM and own the display outputs. **L**.
- **Anyone pivoted a rooted M19/M16P3 OLED to general-purpose Linux:** no public evidence. **L**.

**Translation to a feasibility ranking for the "snappy family panel" goal:**
1. **Realistic today:** HBC-rooted stock webOS with LG apps uninstalled or hidden, Content Store disabled, telemetry daemons killed, auto-updates off. This is the well-trodden path.
2. **Research-level but plausible:** Keep LG's kernel + display drivers, run your **own compositor** (Weston or chromium-kiosk) under the LG kernel after killing `surface-manager`/`sam`. No public success story, but no public attempt I could find either; the kernel modules are all present in the running system, and HBC gives you root. This is original work.
3. **Not feasible without original hardware-level research:** kexec'ing an upstream Linux image. The display pipeline drivers for LG1k are not mainlined; `webos-kernel-drivers` ships against LG's own kernel sources (`opensource.lge.com`) and does not describe a path to boot a different kernel on M19.

### 5.2 Nuke-userland recovery surface
- **What survives wiping `/mnt/lg`:** no public answer. The partition layout for M19 is not in the open source packages because *"lxboot is not open source"* (throwaway96) and the usual partition-offset file is missing for LX SoC models. The only community recovery assumption is that a USB-EPK reflash through expert-mode UI restores a bootable state, **provided the system still reaches that UI**. Wiping `/mnt/lg` wholesale is not the same as wiping rootfs, but no one has published what partitions back it.
- **Does bricking userland force UART/SPI recovery?** Per downgr8: on webOS 4+ *"you will not be able to enable DEBUG if the system does not boot."* So: on a soft-brick that still boots to any recovery UI, you can try an expert-mode USB-EPK flash. On a hard-brick, UART is silent (RELEASE/debugMode=5 = locked), which leaves **eMMC chip-off / ISP** as the only recovery path. That matches owner's prior read. (**M**; nobody has posted a B9 bench recovery.)

### 5.3 Display pipeline without LG stack
- **TCON/backlight/HDMI-input from minimal userland:** no public writeup. The LG kernel exposes these via a mix of DRM/KMS-ish nodes and vendor framework ioctls; the *vendor framework* ioctls are what `surface-manager`, `sam`, and the HDMI input service use, and they are undocumented. I did not find a single post describing driving them from standalone code on any LG OLED generation. **L**.
- **Replace compositor with Weston or chromium-kiosk, keep LG drivers:** no prior art. The `luna-surfacemanager` source (webosose, mirrored on OpenEmbedded) is open and tells you what Wayland protocol it speaks, but the TV-side `surface-manager` binary on retail hardware is the LG fork, not luna-surfacemanager. There is no verified matrix of "which parts of the LG display stack are vendor-closed vs reusable Wayland." **L — treat as new research, not integration.**
- **Panel driven from kexec'd Alpine on any LG OLED:** no public example found on any generation. **L**.

### 5.4 Fast-boot / RAM numbers after stripping
No published cold-boot or idle-RAM benchmarks for a debloated rooted webOS TV. The closest adjacent data is a 2011 Phoronix benchmark of webOS 3.0 on an HP TouchPad (kernel 2.6.35-palm-tenderloin, ~918 MB RAM) and generic "kernel debloating speeds boot" academic work (ACM/CSUR survey, DOI 10.1145/3379469). Neither is useful as a predictor for the B9. **This is a gap worth measuring ourselves if the project goes anywhere.** (**L**.)

### 5.5 Direct HDMI-input switch via ioctl
No public documentation for the HDMI-input-switch ioctl on LG1k. On LG OLEDs the input-change path on stock webOS is `luna-send com.webos.service.tv.systemproperty/...` / `com.webos.service.apiadapter` calls that end up at a vendor driver, but the raw ioctl number/structure is not published. Known runtime tooling for rooted TVs still goes through the **luna bus**, not raw ioctls — which means removing `sam` / input-manager also removes the known-working way to change input. **Original work territory.** (**L**.)

---

## 6. Shopping list

### USB-TTL adapter (3.3 V)
- **FTDI FT232RL breakout** with explicit **3.3 V / 5 V selector jumper** — the "FT232RL FTDI USB to TTL Serial Adapter Module" (search DigiKey or Amazon; genuine FT232RL chips only — clones with CH340G or counterfeit FT232 are fine electrically but drivers vary). Straps VCCIO to 3.3 V and provides 3.3 V I/O.
- Second choice: **SparkFun FT232RL Basic Breakout 3.3V** (SKU DEV-09873) if he prefers a known-good board.
- Avoid: a 5 V-only adapter (Arduino Uno onboard FTDI is not 3.3 V on TX/RX).
- Optional but worth it: **1 kΩ inline resistors** on TX/RX anyway, in case the TV's 100 Ω series is missing on a revision.

A level shifter is **not** needed if the adapter is strapped to 3.3 V. CP2102 and CH340G adapters that are 3.3 V-strapped will also work; FT232RL is just the most predictable.

### Pre-UART work
- A **USB stick, 16 MB+, FAT32**, for dejavuln-autoroot or faultmanager-autoroot payloads.
- A **UART-first-aid plan**: capture a boot log over UART only **after** DEBUG has been enabled from a rooted userland (which requires one of the autoroot exploits to have worked first on fw 05.40.45).

### eMMC chip-off / ISP (only when a soft-brick happens — not stocking today)
- **Easy-JTAG Plus kit with eMMC adapter set** (preferred — best LG-TV community coverage).
- Or **RT809H** with BGA-153 and BGA-169 adapters (cheapest usable).
- **Hot-air rework station** capable of 260–280 °C with a reflow profile plus preheater.
- **Low-temperature leaded solder** + no-clean flux for reballing (DEF CON 33 workshop recommendation).
- **BGA reball stencils** matched to Samsung eMMC footprint (both 153 and 169 kept in stock since Samsung has used both at different capacities).
- **Known-good B9 EPK USB firmware image matching your TV's OTAID**, extracted with openlgtv/epk2extract into per-partition raw images, stored offline **before** doing anything intrusive. This is the actually-critical item.

### "I want to try Chromium-kiosk panel" kit
- **No extra hardware** needed on top of HBC root and a fast USB stick.
- Cross-compile toolchain: **buildroot-nc4** (used by webosbrew / Kodi-on-webOS porters).
- Plan on `webos-bridge-64to32` already present on the TV (webosbrew repo).

---

## 7. Gaps — original work still needed for this exact TV

Everything below is a gap that **no public primary source closes** for the OLED55/65B9 on M19/LG1314, fw 05.40.45. Each is work the owner would be doing first-in-the-world if he pursued it.

1. **Photographed B9 UART header.** No one has published a labelled photo of the debug 4-pin on `EAX68784904(1.0)`. Finding and photographing it, then measuring voltage on an idle set, is step one.
2. **Scope trace of B9 boot output on a stock RELEASE set.** Needed to confirm the gist's claim that RELEASE/debugMode=5 leaves the UART silent *all the way through boot* on M19, not just at the lxboot prompt.
3. **F9 / `s` shell access over UART on M19.** throwaway96's warning that LX SoCs (M16 family) require AccessUSB keying for the debug shell does **not** have an M19 data point either way. Someone needs to try.
4. **lxboot partition map for M19.** Not in the GPL drop because lxboot is closed. Would need to be reverse-engineered off a dumped eMMC image.
5. **Any secure-boot chain work below lxboot on LG1k.** No glitch, no voltage/clock attack, no key leak published. Starting from scratch.
6. **Public patch status of fw 05.40.45 against faultmanager and dejavuln.** The author's as-of-2025-08 line is "no patched 4.5 seen." Owner should cross-check on CanI.RootMy.TV and lock a rooted snapshot with HBC before any update.
7. **Driving LG's display pipeline from a replacement compositor.** Nobody has attempted this on any LG OLED. Needs: static analysis of `surface-manager` / `sam` on the running B9, map of which ioctls land where, and a Weston or chromium-kiosk port that speaks them.
8. **Boot-time and idle-RAM baseline for a debloated webOS 4.5 B9.** No published numbers. Worth measuring *before* any userland changes so improvement can be quantified.
9. **HDMI-input switch without input-manager.** No published ioctl numbers for the LG1k HDMI switch driver. Would need `strace` or vendor-driver static analysis.
10. **kexec on M19.** No published attempt. `webos-kernel-drivers` supports out-of-tree modules against LG's own kernel; it does **not** attempt to replace the kernel, and does not list M19.

---

## Primary sources cited

- throwaway96, "LG webOS TV serial / debug mode" gist — https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1
- throwaway96, `faultmanager-autoroot` — https://github.com/throwaway96/faultmanager-autoroot
- throwaway96, `dejavuln-autoroot` — https://github.com/throwaway96/dejavuln-autoroot
- throwaway96, `downgr8` (README via awesome.ecosyste.ms index; repo at https://github.com/throwaway96/downgr8) — https://awesome.ecosyste.ms/projects/github.com%2Fthrowaway96%2Fdowngr8
- throwaway96, `webos-kernel-drivers` — https://github.com/throwaway96/webos-kernel-drivers
- throwaway96, patch-notice README for RootMyTV — https://github.com/throwaway96/RootMyTV.github.io/blob/patch-notice2-20231216/README.md
- throwaway96, misc gists (crashd backdoor etc.) — https://gist.github.com/throwaway96/da6ba0d899720b0dedb0b68ea2b957de and https://gist.github.com/throwaway96/e811b0f7cc2a705a5a476a8dfa45e09f
- webosbrew dejavuln guide — https://webosbrew.org/guides/rooting/dejavuln
- webosbrew Homebrew Channel — https://repo.webosbrew.org/apps/org.webosbrew.hbchannel
- ShopJimmy OLED65B9PUA main board listing — https://www.shopjimmy.com/lg-ebt65973007-main-board-for-oled65b9pua/
- OpenLGTV coverage (Gigazine 2021-11-26) — https://gigazine.net/gsc_news/en/20211126-openlgtv
- DEF CON 33 "eMMC BGA Secrets" workshop — https://media.defcon.org/DEF%20CON%2033/DEF%20CON%2033%20workshops/DEF%20CON%2033%20-%20Workshops%20-%20Patrick%20Kelly%20-%20EMMC%20BGA%20Secrets.pdf
- Rossmann eMMC data recovery notes — https://rossmanngroup.com/services/emmc-data-recovery
- webOS OSE forum, "Can I flash webOS OSE to my LG Smart TV?" — https://forum.webosose.org/t/can-i-flash-webos-ose-to-my-lg-smart-tv/1738
- CVE-2023-6318/6319/6320 references — https://www.tenable.com/cve/CVE-2023-6318, https://cve-old.yack.one/cve/CVE-2023-6319, https://www.rapid7.com/db/vulnerabilities/cve-2023-6320/
- luna-surfacemanager (reference compositor source) — https://awesome.ecosyste.ms/projects/github.com%2Fwebosose%2Fluna-surfacemanager
- webos-bridge-64to32 — https://awesome.ecosyste.ms/projects/github.com%2Fwebosbrew%2Fwebos-bridge-64to32

Not found despite targeted searches: openlgtv.org wiki pages, `lg-webos-kexec` repo, any annotated B9 teardown with debug header, any public B9 UART transcript, any secure-boot work on LG1k below lxboot.

---

# PART II — Scalpel approach (post-scope-refocus)

The owner's new emphasis: don't replace webOS userland, **surgically remove one layer at a time** of the stock stack, reboot, verify, repeat. Everything above becomes fallback. Below is the primary-source research on the scalpel path, with confidence tags.

## 8. Community-documented safe-to-disable services on webOS 4.x

### 8.1 `lewisdoesstuff/lifesgoodwithoutspying` (LGWS) — the serious reference

Repo: https://github.com/lewisdoesstuff/lifesgoodwithoutspying  Last updated 2026-11-04 (one day ago as of this report). README retrieved verbatim via `gh api`.

Author's own compatibility statement (**H**, but B9 not individually tested): *"Supported on webOS 4 and newer. Only tested on webOS 23 (9) and webOS 4.4 so far — webOS 5+ reported working okay."* Tested on OLED65G45LW (EU) webOS 9.2.4. **The webOS 4.4 test is the single most relevant data point** for B9 fw 05.40.45 (webOS 4.5 / 4.9) in any public source I could find.

What LGWS actively stubs/stops (per README, quoted):
- **Ad / ACR / telemetry daemons:** `admanager`, `livepick`, `acr2`, `nudge`, `rdxd`, `uploadd`, `sportsalarm`
- **Voice / NLP daemons:** `voiceinput`, `voiceconductor`, `nlpmanager`, `performer`, and "the voice app"
- **ThinQ / IoT (toggleable):** `trigger_thinq`, `trigger_alexa`, `iot-client`, `iot-proxy`
- **UPnP/SSDP (toggleable):** `/usr/sbin/upnpd` — flagged as "breaks casting to the TV too"

Mechanism (**H**, direct source):
1. Bind-mount an inert stub over each target binary so the Luna hub cannot respawn it — "no polling loop." This is the specific technique owner's existing kit may or may not use; worth double-checking.
2. For services that other code **expects to call** (`admanager`, `voiceconductor`, `voiceinput`), register a **stand-in Luna service** that answers queries with all-zero ad ID / no voice languages so "apps and Settings don't hang waiting on them." Without the stub-reply, Settings hangs.
3. Bind-mount a generated `/etc/hosts` for category-toggleable domain blackholes.
4. Re-apply at boot via a Homebrew Channel `init.d` hook.
5. Explicit wipe of locally buffered ACR / speech-to-text files.

Known webOS-4.x caveats from the same README (**H**):
- "4.x has no `busctl`, so the DNS filter reads ConnMan's settings with `dbus-send` instead." — worth knowing before copying 5+/9 recipes verbatim onto B9.
- "Protection may be off after a reboot. Some 4.x firmware never runs the Homebrew Channel startup hook (webos-homebrew-channel#124)." — i.e. B9 may need `nospy-ctl.sh` run manually after each reboot, **or** the fix in webos-homebrew-channel PR #230 installed. Owner's root install should be current enough to have this; verify HBC version.

### 8.2 `sonodima/webos-unclutter` (older, DNS-only, less useful)

Repo: https://github.com/sonodima/webos-unclutter  Last updated 2026-10-22.  Built against **European LG C1 webOS 6.0** (**M** for B9). Approach: standalone DNS proxy running on a server, TV points its DNS at it. **Does not touch TV-side services at all** — pure network-level block. Config toggles: `lg_smart_ad`, `home_dashboard`, `sports`, `app_store`, `internet_channels`, `lg_iot`, `amazon`, `philips_hue`, `software_updates`. Author's own caveat: *"Other webOS versions (or TVs in different regions) may communicate to different servers, and would probably require the addition of new rules in the blacklist."* Useful as a **cross-reference list** of categories, not as a scalpel tool for B9.

### 8.3 Level1Techs / Wendell "LG TV Block Mini-How-to" (strong recent primary source)

URL: https://forum.level1techs.com/t/lg-tv-block-mini-how-to/255178. Original post 2026-09-05, recon dated 2026-08-24. Primary test target: OLED65G5WUA, webOS 10.2.1 — **newer than B9**. Still the best recently-researched hostname inventory. (**M** for B9 since hostnames may differ; use as the superset, not canonical B9 list.)

Verbatim findings:
- **OS updates:** block `snu.lge.com`, `su.lge.com`, `su-ssl.lge.com`, `nsu.lge.com`, `snu-dev.lge.com`, `su-dev.lge.com`.
- **Telemetry (SDX):** `ibs.nextlgsdp.com`, `ibsstat.nextlgsdp.com`, `rdx2.nextlgsdp.com`, `nudge.lgtvcommon.com`, `recommend.lgtvcommon.com`, `cdpsvc.lgtvcommon.com`, `cdpbeacon.lgtvcommon.com`, `rdl.lgtvcommon.com`, `qcardservice.lgtvcommon.com`, `lggalleryplus.com`, `tv.wiselg.com`, `lgshopsvc.lgappstv.com`.
- **Ads:** `lgsmartad.com`, `info.lgsmartad.com`.
- **ThinQ/IoT:** `api.lgtviot.com`, `commonpush.lgtviot.com`, `sports.lgtviot.com`, `ocp.lgtviot.com`, `push.lgtviot.com`, `buddy.lgtviot.com`, `common.lgthinq.com`, `connect-client.lgthinq.com`.
- **LLM/AI:** `ngfts.lge.com`, `qt2-ngfts.lge.com`, `kic-ngfts.lge.com`.
- **Voice:** `nextlgsdp.com` (sdp_nlp backend), `lgsmartweb.com`.
- **Content Store (OPTIONAL):** `lgtvsdp.com`, `lgappstv.com` — **breaks Content Store if blocked; commented out by default**.
- **ACR:** *no hostnames* — "`acr2` is inert on the test TV, so ACR is handled by declining consent and creating an opt-out marker." For the B9, ACR is driven by the `acr2` daemon, which LGWS stops directly; a DNS-only strategy will not stop ACR.

**Critical finding — hardcoded fallback IP:** *"`/usr/sbin/update` has a hardcoded fallback, `156.147.69.32:8080`, used when DNS fails. The author says hosts-file entries cannot block an IP, so it must be blocked at the router or firewall."* Wendell also observes `54.186.247.229:443` as a live SDX telemetry endpoint. (**H**, Wendell, G5 but same binary present on earlier webOS likely — verify on B9.)

### 8.4 webosbrew glossary daemon notes (**H**, authoritative)

webosbrew.org/pages/glossary describes **`rdxd`** as the *"TV-side 'Diagnostics' daemon responsible for sending crash logs and system logs to LG's backend."* OpenLGTV notes gist (https://gist.github.com/Informatic/1983f2e501444cf1cbd182e50820d6c1) advises *"you most probably want to disable rdxd first, as per rootmytv immutable mounts."* — meaning rdxd is the first scalpel cut everybody agrees on and nobody has reported a boot failure from.

### 8.5 Services the community routinely kills — consolidated for B9

| Service (binary) | What it does | Published as safe-to-stop on webOS 4.x? | Source |
|---|---|---|---|
| `rdxd` | Crash + system log uploader | **Yes (H)** | webosbrew glossary; LGWS; Informatic gist |
| `uploadd` | Generic LG upload daemon | **Yes (H)** | LGWS README |
| `acr2` | Automatic Content Recognition | **Yes (M for B9; H on 4.4)** | LGWS README |
| `livepick` | LivePlus / ACR-adjacent program-recognition | **Yes (M for B9; H on 4.4)** | LGWS README |
| `admanager` | Ad SDK broker (also serves ad-ID requests) | **Yes, but needs stub-reply** | LGWS README |
| `nudge` | Nudge/recommendation service | **Yes (M)** | LGWS README |
| `sportsalarm` | Sports-event push | **Yes (M)** | LGWS README |
| `voiceinput`, `voiceconductor`, `nlpmanager`, `performer` | Voice capture + remote NLP pipeline | **Yes, needs stub-reply for voiceconductor/voiceinput** — "remote voice key may stop working" | LGWS README |
| `trigger_thinq`, `trigger_alexa`, `iot-client`, `iot-proxy` | ThinQ companion + Alexa integration | **Yes, toggle** | LGWS README |
| `upnpd` | UPnP/SSDP | **Yes, toggle** — "breaks casting TO the TV" | LGWS README |

**For the "kill ACR" minimum (owner asked explicitly):** stop `acr2` and `livepick`; wipe locally buffered ACR files; decline the ACR / LivePlus consent in Settings; block the ad hostnames. DNS-only blocking will **not** stop ACR because ACR has no network hostnames in Wendell's recon — `acr2` is the thing to stub. LGWS is the only tool I found that does this end-to-end.

**For "kill voice phone-home" minimum:** stub `voiceinput` + `voiceconductor` + `nlpmanager` + `performer`, register stand-ins for the first two, block `lgsmartweb.com` and the regional NLP under `nextlgsdp.com`. LGWS warns remote voice button may stop responding — acceptable per owner's "no voice assistants" line.

**For "kill crash telemetry" minimum:** stop `rdxd`, `uploadd`, block the whole SDX group (`*.nextlgsdp.com`, `rdl.lgtvcommon.com`, `cdpbeacon.lgtvcommon.com`).

## 9. Do-NOT-remove services on webOS 4.x — the brick list

**This is the biggest gap in the public record.** No source lists "services that black-screen the TV if you kill them" for webOS 4.x explicitly. Inference from what LGWS deliberately leaves alone and from scattered forum reports:

- **surface-manager / sam / webappmgr / WAM / lunamgr / lunabus** — nobody has published a successful removal. These are the compositor + application lifecycle + Luna IPC bus; killing any of them removes the TV's ability to display anything. LGWS does **not** touch these. (**M**, strong consensus-by-absence.)
- **`settings-service`, `com.webos.service.systemservice`, `tv.service`** — the "Settings UI hangs waiting on them" symptom is why LGWS *replaces* admanager/voiceconductor/voiceinput with stand-ins rather than deleting the Luna registration. Pattern generalizes: if an LG service has clients, removing the service entirely hangs the clients. **Stub, don't delete.** (**H**, from LGWS mechanism rationale.)
- **`connman`** — network stack; LGWS explicitly interoperates with it (DNS helper takes over its resolver), does not remove it. Removal would kill networking. (**H**.)
- **Boot-time services covered by HBC init.d hook** — webos-homebrew-channel issue #124 shows that on some 4.x firmware HBC's startup hook doesn't run at all. Replacing boot services that LG expects to come up may leave you unable to re-root. (**H**.)

**Brick-report evidence I could find for webOS 4.x specifically:** nothing explicit. The databeat.net LG public-display support pages describe bootloops caused by third-party signage apps (unrelated). The Emby forum post attributes stuck-on-loading to *"internal LG api services not starting quickly enough"* (unverified user claim, not official). **There is no published "I killed daemon X and my 4.x OLED black-screened" post-mortem in my searches.** This is a safety gap: the scalpel's first cuts should be ones LGWS already validates, and anything else is original work with a non-zero brick risk.

## 10. DNS-level blocklist landscape

Community-maintained lists (datestamps where visible):

- **Perflyst smart-TV blocklist** — https://perflyst.github.io/PiHoleBlocklist/SmartTV.txt (regex companion at `regex.list`). LG section covers `smartshare.lgtvsdp.com`, `ad.lgappstv.com`, `ibis.lgappstv.com`, `us.info.lgsmartad.com`, `us.ad.lgsmartad.com`, `us.rdx2.lgtvsdp.com`, `smartclip.com`, `smartclip.net`, `yumenetworks.com`. Active repo. (**M**, generic across all LG TVs.)
- **wassname gist + DeKubus fork** — https://gist.github.com/wassname/78eeaaad299dc4cddd04e372f20a9aa7 / https://gist.github.com/DeKubus/dbcb445eb6413c8ee5b95a762f96164d. Older, same core set, commented-out ThinQ entries. (**L** by age.)
- **dlpgithub/block_lists `smart-tvs.txt`** — https://github.com/dlpgithub/block_lists/blob/cbf5d753df68ea715394e5daf218a81e714c3e0a/smart-tvs.txt. (**L**.)
- **Level1Techs mini-howto blocklist** — built from 2026-08 recon on G5 webOS 10.2.1; this is the **freshest** published list but **tested on only one newer model**. See §8.3 for the full inventory. (**H** for G5, **M** for B9.)
- **LGWS bind-mounted `/etc/hosts`** — per-category, lives on the TV itself, not at the gateway. Best coverage for ACR because it also stops the daemon.

**Gaps vs. "lge.com snu/su" baseline (owner said their kit already covers that):**

Items in Wendell's 2026 recon that commonly are *not* in older lists:
- `*.nextlgsdp.com` family (SDX telemetry / NLP) — entire family is modern
- `*.lgtvcommon.com` family (`nudge`, `cdpbeacon`, `rdl`, `qcardservice`)
- `*.lgtviot.com` and `*.lgthinq.com` (ThinQ side)
- `ngfts.lge.com` + `qt2-ngfts.lge.com` + `kic-ngfts.lge.com` (LG AI/LLM endpoints — new)
- `www.ueiwsp.com` (QuickSet remote-code lookup, LGWS category `domains.quickset`)
- `*.tv.wiselg.com` (home-app session recording — LGWS category `domains.wiselg`)
- `*.app.lgwebostv.com`, `*.lgrecommends.lgappstv.com` (Content Store — but blocking breaks store with error -102 / `P6.48.SZ`; LGWS category `domains.lgrecommends`, default off)
- Hardcoded IPs: `156.147.69.32:8080` (update fallback in `/usr/sbin/update`), `54.186.247.229:443` (live SDX) — **must be blocked at the router/router, DNS cannot touch them**

## 11. Factory-reset behavior on a rooted webOS 4.x B9

Direct quotes from RootMyTV README (via throwaway96 fork `patch-notice2-20231216`): *"a reset should remove all root-related configuration files… there is no convenient root-removal tool short of that, and a knowledgeable person may need to remove our customizations manually."* (**M**, written for the general RootMyTV flow; B9 not specifically called out.)

Separate RootMyTV caveat: *"the `getmein` binary automatically modifies `start-devmode.sh` in ways that can cause semi-permanent damage to your TV that will not be fixable with a factory reset."* — so the one documented footgun is `getmein`, which is part of the older RootMyTV flow and not of `faultmanager-autoroot` / `dejavuln-autoroot`. Worth confirming that owner's root install path did not use `getmein`. (**M**.)

**What survives a factory reset (inference from above):**
- `/var/lib/webosbrew/` — survival unknown, not documented either way
- `/mnt/lg/cmn_data/wam/` — one community cleanup command (`rm -rf /var/lib/webosbrew/ /mnt/lg/cmn_data/wam/`) implies these are the two writable-state locations, suggesting factory reset probably clears `/mnt/lg/` writable state but this is not confirmed
- HBC install itself — RootMyTV says reset *should* remove it, implying yes
- `start-devmode.sh` modified by `getmein` — **survives** per the RootMyTV warning

**Service-menu factory reset vs UI factory reset:** no published comparison for B9. UI reset is the only documented path; service-menu "Factory Reset" exists but community reports around it are all about older MStar-based LG LCDs, not M19 OLEDs.

**Boot-key combo for recovery:** I found **no published key combo** that puts an M19 OLED into any recovery/SBL mode. LG's documented procedures for OLED are TV-UI menus or the service menu via remote (secret key sequences differ by firmware). Nobody has published an equivalent of Android's "hold vol-down at power-on" for M19.

**Net recovery surface for an un-UART-able B9:** USB-EPK expert-mode flash (needs TV to boot to the expert-mode trigger, which needs HBC root first) → downgr8 route → eMMC chip-off. Factory reset is only useful while the TV still boots.

## 12. Deltas vs. owner's existing telemetry-off kit (what's new to steal)

Things worth cross-checking against owner's current kit:
1. **`acr2` and `livepick` daemons stubbed, not just DNS-blocked.** DNS-only misses ACR entirely.
2. **Stand-in Luna services** for `admanager`, `voiceconductor`, `voiceinput` — without them, Settings hangs rather than returns.
3. **`156.147.69.32:8080` hardcoded update IP** — must be dropped at router, not just DNS.
4. **`54.186.247.229:443` live SDX endpoint** — same, firewall only.
5. **SDX category blocked with 60-second clock-sync grace** — webOS without NTP gets clock from the SDX `X-Server-Time` header; blocking SDX from boot leaves the TV's clock wrong. LGWS's NTP-fallback (`pool.ntp.org`, UDP/123 out) is the clean fix.
6. **`ngfts.lge.com` + variants** — LG's LLM endpoints, likely absent from older Pi-hole lists.
7. **`www.ueiwsp.com`** — QuickSet remote-code periodic lookup; previously uncategorized.
8. **`*.tv.wiselg.com` app-session uploads** — carries app IDs, user number, start/end times. Older lists usually miss these.

## 13. Shopping list — scalpel additions

Nothing new to buy; the primary additions are software:

- Install **LGWS from its custom HBC repo** (`https://raw.githubusercontent.com/lewisdoesstuff/lifesgoodwithoutspying/main/repo.json`). Tested on webOS 4.4 by the author. **Review the source first** — the README itself flags that "most of the code was generated by AI."
- Confirm **HBC v0.7.2+** is installed (the fix for the webOS 4.x startup-hook bug ships in that line via PR #230).
- **router rule** dropping outbound traffic to `156.147.69.32/32:8080` and `54.186.247.229/32:443` — these cannot be DNS-blocked.
- **Optional:** mirror Wendell's blocklist regexes into the LAN Pi-hole/router as a belt-and-suspenders layer on top of LGWS's `/etc/hosts` mount.

## 14. Gaps — original work still needed (scalpel version)

1. **No B9 daemon-by-daemon validation matrix.** LGWS tests on webOS 4.4 and webOS 9 only; owner's 4.5/4.9 on B9 is adjacent but untested. Owner would be producing the first public B9-specific "I disabled X, it worked" / "I disabled Y, black screen" table.
2. **No published "do-not-touch" list for webOS 4.x.** Everything above §9 is inference. First incident on B9 adds a data point to the community.
3. **ACR behavior post-stub on webOS 4.5.** Wendell says `acr2` is inert on his G5; LGWS says it stubs `acr2` on 4.4. Nobody has posted a dump of what `/mnt/lg` ACR state looks like on a running B9 to confirm.
4. **Service-menu factory reset vs UI reset state matrix on M19.** Not published.
5. **Which partitions back `/mnt/lg` on M19.** Partition layout not public (lxboot closed). A rooted `cat /proc/mounts` + `ls -la /dev/mmcblk0p*` dump from a stock B9 would be useful to the community.
6. **Boot-time key combos for M19 recovery.** Not published. Worth probing (hold channel-up+power, hold vol-down+input, etc.) but with eMMC backup in hand first.
7. **Hardcoded IPs beyond the two Wendell found.** `strings /usr/sbin/update` and friends on a B9 would confirm whether the same pair are present or if B9 has different fallback addresses.

