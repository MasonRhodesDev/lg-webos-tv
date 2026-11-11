# B9 / webOS 4.5 / 05.40.45 — Community Prior-Art Map (Component A4)

Target context: LG OLED B9 (2019), webOS 4.5, firmware 05.40.45, OTAID family `W19O` (LG LX chassis, Alpha 7 Gen 2 / LG1314, M19 SoC family).

Retrieved 2026-11-04 via `gh api` and WebSearch (read-only).

---

## 1. Rooting chains that work on this TV

| Tool | Level | fw range per README | 05.40.45 B9 (W19O)? | Repo |
|------|-------|---------------------|---------------------|------|
| **faultmanager-autoroot** (buglloc vuln, throwaway96) | Userland root → HBChannel; triggers SEGV in `faultmanager` service | webOS 4.0 through 10.0 (vuln introduced in 3.5 but this script doesn't trigger there); README (2025-08-24): "webOS 4.0 probably won't be patched … I haven't seen any patched webOS 4.5 firmware yet" | **Very likely YES** (W19O = webOS 4.5 OTAID; no patched 4.5 fw observed as of 2025-08) | https://github.com/throwaway96/faultmanager-autoroot |
| **dejavuln-autoroot** (jcxdev, throwaway96) | Userland root → HBChannel; USB-only, no network, no Dev Mode (exploits Music/Media Player MP3 filename command injection, same class as CVE-2023-6319) | webOS 3.5 and newer; README: 4.5 "I haven't seen any patched webOS 4.5 firmware yet" | **Very likely YES** | https://github.com/throwaway96/dejavuln-autoroot |
| **RootMyTV v1/v2** (webosbrew) | Userland root via browser `luna://` abuse; "Slide to root" via rootmy.tv | 2018 webOS 4.0: patched since 4.4.2; 2019 webOS 4.5: **patched since 4.9.7** (per compatibility table in RootMyTV README) | **NO** — 05.40.45 > 04.09.70 on W19O; patched (also the clouduploadd/crashd vuln was patched on W19O first in 05.30.45 per throwaway96 EOL gist) | https://github.com/RootMyTV/RootMyTV.github.io |
| **mvpd-autoroot** | Userland root via `mvpd-service` | webOS 1 – 3.4.2 only | NO (too old) | https://github.com/throwaway96/mvpd-autoroot |
| **chariot-autoroot** | Instart "Chariot Endpoint" test launcher | webOS 1.x only | NO | https://github.com/throwaway96/chariot-autoroot |
| **WTA backdoor** (mariotaku, throwaway96 gist) | Boot-time `wta_usb.sh` on USB; runs as root via LG's own service during boot | webOS 5+ only ("vulnerability/backdoor in webOS 5+") | NO (B9 is 4.5) | https://gist.github.com/throwaway96/b171240ef59d7f5fd6fb48fc6dfd2941 |
| **NVM debugstatus flip** | **Deeper than userland** — unlocks DEBUG mode → bootloader console + debug menu via serial + root shell from debug menu | webOS ≤ 4.x (NVM on I²C EEPROM). webOS 5+ moves to encrypted `dbboot` partition. B9 is 4.5, so YES; must solder/test-clip to I²C EEPROM | **YES** but requires physical access to EEPROM IC (SOIC-8, offset 0x1a1 = 5 → 3) | https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1 |

Primary pointer the community uses to confirm a specific build: https://cani.rootmy.tv/ (requires Chip Type + exact fw string). Site itself is a thin JS frontend — the authoritative version data is baked into the static assets / RootMyTV repo.

## 2. Downgrade / expert-mode tools

- **throwaway96/downgr8** — https://github.com/throwaway96/downgr8
  - *Does:* launches the "expert mode" update UI on webOS TVs where the old `touch /tmp/usb-expertmode` trick was patched (early 2022+). Patches `update`'s in-memory Luna URI so it thinks an "Access USB" hardware dongle is authenticated. Ships a C service + app script. Inspired by Buchanan's `sampatcher.py`.
  - *Does NOT:* bypass EPK signature verification. Does NOT install unsigned firmware. **Requires root already**. Does NOT work on webOS 1 or 2 (old method still works there).
  - Pre-2022 alternative shown in-README: `touch /tmp/usb-expertmode; luna-send -n 1 ...softwareupdate launch mode=expert` — this likely still works on B9 05.40.45 given no 4.5 patch has been observed (confirm by `strings /usr/sbin/update | grep /tmp/usb-expertmode`).
- **reprodev/LGTV-Firmware-Downgrade** — https://github.com/reprodev/LGTV-Firmware-Downgrade — walkthrough/guide repo, not an exploit. Three methods: webosapp.club/downgrade/ web redirector, `webos4x-6x.expertmode.downgrade_1.0.0_all.ipk` (served from `45.140.167.171/ipk/` — a Russian community mirror, treat as untrusted), and raw `luna-send` of `com.webos.app.softwareupdate`. Confirmed on webOS 4.5–6.x path per README.
- **openlgtv/epk2extract** — supports **signed EPK v2/v3 decryption** when you already have per-SoC AES+RSA keys dumped from a running TV. Does NOT produce signed EPKs; explicitly "not designed to repack files". Key sets are added per-SoC as community dumps appear; recent commits (2026-07…2026-10) added keys for Realtek K26, K25lpnlm, K6Lp WEE, MStar M1AP, o22n_emmc layout.

The practical community consensus: downgrade path only matters *before* root. After root, you have the filesystem anyway and downgrade is only useful for switching exploit prerequisites.

## 3. EPK tooling in the wild

- **openlgtv/epk2extract** (canonical) — https://github.com/openlgtv/epk2extract
  - Formats: epk v1 (plain), epk v2 (signed+encrypted, keys needed), epk v3 (webOS, keys needed), Mediatek PKG, Philips fusion, squashfs/cramfs/lz4/lzo/gzip/jffs2, **lzhs** (MTK bootloader compression — lzss+huffman), **lzhs_fs** (MTK 3rdw partition), `partinfo`/`mtdinfo` (part.pak / mtdi.pak), SYM (debug symbols → IDA .idc).
  - Recent commits touching webOS/MStar/Realtek keyring for 2024–2026 TVs: `668b6a8` (2026-10-24, K25lpnlm RTK keys), `b5f055d` (2026-07-21, K6Lp WEE FHD), `94c95fd` (2026-08-13, MStar M1AP), `7e43f40` (2026-08-05, RTK K26). No M19 (LG1314) commits observed in 2024-2026 window — M19 key material is presumably already present (M16U/M19 are 2019-era LX keys shipped long ago).
  - Explicit warning: do NOT use it to repack files for installation. No signature-forge path is in-tree.
- **Forks active in 2026:** theubusu/epk2extract (2026-10-24), marekbujko/, Ricky1966/, Boltjazz/, WilkenDK/, Boltjazz/ (2026-09-04 batch tracks upstream). `kitsuned` is actively contributing keys upstream (several 2026 PRs). No fork appears to carry a signing-oracle or repack feature.

## 4. Bootloader / lxboot public work

- **openlgtv/bootSdk** — https://github.com/openlgtv/bootSdk ("Custom binaries in lxboot or uboot (Proof of Concept)", 2019 — small, 7 stars, **unmaintained**). This is the only known public artifact that runs custom code from within lxboot/u-boot context. Needs DEBUG + serial console to be useful.
- **throwaway96/bootSdk** — personal dev fork — https://github.com/throwaway96/bootSdk
- **kitsuned/lxboot-env** — https://github.com/kitsuned/lxboot-env (active 2026-08) — Rust CLI to read/set lxboot environment variables from userspace (needs root already). Confirms that lxboot env storage format is partially understood; targets a file or raw block partition.
- **throwaway96/realtek-bootcode** — https://github.com/throwaway96/realtek-bootcode (empty description, 2020, untouched since) — RTK bootcode reversing notes/materials.
- **throwaway96/mboot_parts** — MStar MBoot partition tools, WIP — adjacent chassis, not LX/M19.
- **throwaway96 NVM gist** https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1 — the single best public writeup on getting to lxboot in the first place: debugstatus semantics (`DEBUG`=3/`EVENT`=4/`RELEASE`=5 at NVM offset 0x1a1 on webOS 3.x–4.x; from webOS 5+ the setting lives in encrypted `dbboot` eMMC partition), EEPROM part identification (Rohm BR24G256F-3 marked "4G25", FMD FT24C256A, Atmel AT24C256C, ST M24M01), Instart menu password `0413`, serial console enable via System 1/System 2 menus, F9 → `sh` to drop to root from the debug menu. Explicit: **"lxboot is not open source"** — no sources in LG GPL packages for LX SoCs.
- **throwaway96 crashd gist** https://gist.github.com/throwaway96/e811b0f7cc2a705a5a476a8dfa45e09f — EOL 2024-07-21 but FAQ + OTAID→patched-fw table is still the canonical reference; this is where the `W19O → 05.30.45` first-patched entry lives for the clouduploadd/crashd path.

No public repo/gist contains a decrypted lxboot image, signature scheme, or signing bypass attempt. No one has published a boot-ROM dump for LG1314/M19.

## 5. Published CVEs relevant to webOS 4.5

Bitdefender quartet (reported 2023-11-01, patched by LG 2024-03-22):

| CVE | Short | Affected (per Bitdefender) | Useful for fw install? |
|-----|-------|-----------------------------|------------------------|
| **CVE-2023-6317** | PIN-check skip → create privileged account profile in `secondscreen.gateway` | webOS 4.9.7, 5.5.0, 6.3.3-442, 7.3.1-43 | No. User creation only. Chains into next CVEs. |
| **CVE-2023-6318** | Priv-esc to root | same ranges | No direct install; gets root which lets you call `update` service. |
| **CVE-2023-6319** | OS command injection via `getAudioMetadata` in `com.webos.service.attachedstoragemanager` (lyrics library). Root command exec. | webOS 4 through 7 | **Yes, indirectly** — root RCE is enough to flip expert-mode + install a chosen EPK (if you already have a signed-by-LG one). |
| **CVE-2023-6320** | Authenticated command injection in `com.webos.service.connectionmanager /tv/setVlanStaticAddress`, exec as `dbus` user; CVSS 9.1 | webOS 5 and 6 (per NVD narrative — not webOS 4.5) | Not on B9. |

Patch status for B9 (05.40.45): per the W19O OTAID patch table in the crashd EOL gist, the **clouduploadd/crashd** family was patched first at 05.30.45 — 05.40.45 **is past that**, so the 6319 class is patched (clouduploadd removed). But dejavuln-autoroot exploits the **same conceptual bug class** (Music/Media Player filename handling) in a different code path and the README specifically states dejavuln is NOT patched on current webOS 4.5 firmware.

None of these CVEs are a signed-EPK-install bypass. All deliver root, from which the existing LG-signed install flow is how you flash firmware. There is **no public CVE** for the EPK signature check itself.

Secondary sources: NVD (CVE-2023-6320 published 2024-04-09 CVSS 9.1), Bitdefender advisory https://www.bitdefender.com/blog/labs/vulnerabilities-identified-in-lg-webos (dated April 2024).

## 6. SoC-level research (LG1314 / Alpha 7 Gen 2 / LX M19 family)

- **Zero public voltage-glitch / fault-injection work specific to LG1314, M19, or any LX/Alpha series SoC** was found on GitHub, arXiv, or conference indexes (searched 2026-11-04).
- Adjacent references that establish the technique class but do NOT touch LG parts: arxiv 2108.06131 ("Forgotten Threat of Voltage Glitching: Case Study on Nvidia Tegra X2 SoCs", 2021); MITRE CWE-1247; a US patent US9141809 (timing-based glitch deterrence during secure boot).
- The M-series naming: `M14/M14P` (webOS 1-era), `M16/M16U/M16lite` (2017–2018, webOS 3.5/4.0), `M19` (2019, webOS 4.5, used on W19O = B9/C9/E9 OLED mid-tier). "LG1314" is the marketing/die name; the throwaway96 signage platforms gist (https://gist.github.com/throwaway96/d7df84ce6493506137ac69bbb7592473) is the best public cross-reference for LG SoC → OTAID → model mapping.
- epk2extract supports "LZHS" and "LZHS-FS" — these are MTK bootloader / 3rdw partition compressions, not LX. For LX chassis the bootloader is `lxboot` (closed) and the compressed artifact is typically contained in `tzfw.pak`-style partitions, not directly addressed by epk2extract today for LX.
- No public boot-ROM dump. No known iROM/BL1 signing-key leak.
- The one dimension of SoC-level work present: the UART debug console path (NVM gist). That's the lowest level any public researcher has reached on LG1314 publicly.

## 7. Active community venues

| Venue | URL / invite | Membership | Content notes |
|-------|--------------|------------|---------------|
| **OpenLGTV Discord** | https://discord.gg/xWqRVEm (epk2extract README) and https://discord.gg/hXMHAgJC5R (throwaway96 projects) | Not public from external listings; "the main hub" per webosbrew.org. Likely 5–15k judging by activity pattern in other 2019-era TV communities. | **Gated #research-ish channels** are where throwaway96, buglloc, mariotaku, jcxdev are reachable. The dejavuln README explicitly says "if you want to donate any TV boards for development, please contact me on the OpenLGTV Discord." High signal; worth getting access for B9/M19 board donation offer, UART Q&A, and firmware archives. |
| **webosbrew Matrix** | #openlgtv on netserve.live (bridged to Discord) | — | Mirror of Discord content. |
| **webosbrew.org** | https://webosbrew.org | n/a | Pelican static site — repo `webosbrew/pages`. Links hub for exploits and apps. |
| **r/webOS (reddit)** | https://reddit.com/r/webOS | Low volume, hobbyist | Mostly end-user "how do I root" questions. Low research value. |
| **XDA forum "RootMyTV" thread** | https://forum.xda-developers.com/t/rootmy-tv-coming-soon-developer-pre-release-available-now.4232223 | Thousands of posts, 2021+ | Historical downgrade tips; mostly consumer-facing now. |
| **AVSForum downgrade thread** | avsforum.com/threads/guide-lg-webos-tvs-firmware-downgrade-advanced-users-only.3217168 | moderate | Downgrade folklore, EPK sources. |
| **Russian webos-forums.ru + Telegram t.me/lgwebosusb** | per reprodev repo | unknown, Russian-speaking | Hosts hard-to-find older EPK files for downgrading, including for W19O-family models. Treat as untrusted but a real source. |

## 8. Known unknowns (highest signal gain if obtained)

Ordered by estimated value to this engagement:

1. **A decrypted LG1314 lxboot image + signature scheme.** Would reveal how EPKs are verified at boot-time, what signing roots live in OTP/fuses vs. updatable storage, and whether there's any signature-oracle via the existing `update` service. Nobody has publicly dumped lxboot for LX SoCs.
2. **LG's EPK v3 signing key, or a method to obtain a signing oracle via internal services.** The entire "signed EPK install" assumption hinges on this. No leaks observed. Secondary form: an LG-internal `AccessUSB` hardware dongle (Buchanan's work implies the USB side is auth-gated, not crypto-signed in a hardcore sense — so emulation might be feasible with enough reversing).
3. **A verified B9 UART transcript showing full boot of 05.40.45, including lxboot env dump and command set.** throwaway96 has done this on similar models but no B9-specific capture is public. Combined with lxboot-env (Rust tool), this would map the whole bootloader interface for this chassis in a day.
4. **M19/LG1314 die photos or a boot-ROM dump.** Would make voltage-glitch attack planning tractable. No public work.
5. **The "AccessUSB" dongle protocol / crypto.** downgr8 sidesteps it from userspace, but if the dongle's interface were reversed, signed-EPK install of arbitrary firmware for downgrade/sideload might be achievable without needing root first.
6. **An engineering-firmware EPK for W19O.** Engineering NSU builds often have different signing (test keys) or expanded `update` service behaviour; one for 4.5 would be gold.

---

## Sources (primary URLs, retrieved 2026-11-04)

- https://github.com/throwaway96/faultmanager-autoroot (README)
- https://github.com/throwaway96/dejavuln-autoroot (README)
- https://github.com/RootMyTV/RootMyTV.github.io (README)
- https://github.com/throwaway96/mvpd-autoroot (README)
- https://github.com/throwaway96/chariot-autoroot (README)
- https://github.com/throwaway96/downgr8 (README)
- https://github.com/reprodev/LGTV-Firmware-Downgrade (README)
- https://github.com/openlgtv/epk2extract (README + commit log)
- https://github.com/openlgtv/bootSdk
- https://github.com/kitsuned/lxboot-env
- https://github.com/throwaway96/realtek-bootcode
- https://github.com/webosbrew/webos-homebrew-channel
- https://gist.github.com/throwaway96/827ff726981cc2cbc46a22a2ad7337a1 (NVM / debugstatus / lxboot access)
- https://gist.github.com/throwaway96/e811b0f7cc2a705a5a476a8dfa45e09f (crashd EOL, OTAID→patched-fw table)
- https://gist.github.com/throwaway96/b171240ef59d7f5fd6fb48fc6dfd2941 (WTA backdoor)
- https://gist.github.com/throwaway96/da6ba0d899720b0dedb0b68ea2b957de (RootMyTV compatibility gist)
- https://gist.github.com/throwaway96/d7df84ce6493506137ac69bbb7592473 (LG signage model platforms — SoC map)
- https://www.bitdefender.com/blog/labs/vulnerabilities-identified-in-lg-webos (CVE-2023-6317…6320)
- https://cani.rootmy.tv/ (live vuln checker frontend)
- https://webosbrew.org (community hub)
