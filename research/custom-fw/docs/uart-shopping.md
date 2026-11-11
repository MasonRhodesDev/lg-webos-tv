# UART: parts, pinout, caveats

Short practical summary. Full write-up with sources in `uart-research.md`.

## What we know about the B9's UART

- **Where:** on the main board (part `EBT65973007`, PCB `EAX68784904(1.0)` for 65-inch; 55-inch has a sibling PN). Expected form factor is a **4-pin edge connector** — consistent with C8/E8/B8/C9/E9/B9 community reports. **Not photographed with a confirmed label on a B9 anywhere public** — open the back, look for a 4-pin edge near the SoC.
- **Pinout** (from a 4-pin edge, per throwaway96's gist, applied to B9 by extrapolation):
  - pin 1: +3V3  — **do not connect to the adapter**
  - pin 2: RX    (TV receives; connect to adapter's TX)
  - pin 3: GND
  - pin 4: TX    (TV transmits; connect to adapter's RX)
  - Each data line has a 100 Ω series resistor on the TV side; RX has a 10 kΩ pull-up to 3V3.
- **Levels:** 3.3 V logic. A 5 V adapter will damage the SoC pin.
- **Framing:** 8N1.
- **Baud:** stock cmdline says `console=ttyAMA0,115200n81` — Linux userland is 115200. Bootloader (lxboot) is likely the same, since the console= directive is set by lxboot. Service menu baud setting on earlier LG OLEDs defaulted to 9600; if 115200 shows nothing, try 9600.

## Caveat that specifically affects us

The gist flags that serial output "requires DEBUG mode" on recent LG OLEDs. DEBUG on webOS 4.5 is an NVM byte at offset `0x1A1`: `5` (RELEASE, default) → `3` (DEBUG). On stock the TV may be silent on UART until DEBUG is flipped.

Fix is free: we have HBC root over SSH. Write `0x03` to `/dev/mmcblk0p11` offset `0x1A1`, cold-cycle, UART should come alive. Prior lxboot RE didn't explicitly confirm this byte unlocks lxboot-era output on B9 — treat as the first thing to test once wired.

Also: throwaway96 flags that LX-family SoCs (B9 is LX LG1314 / Alpha 7 Gen2) **may require "AccessUSB" keying for a shell on the UART debug menu**. We don't need an interactive shell — we only need to read lxboot's own output while our hib loads. That part should work on any UART-enabled state.

## Shopping list

Minimum viable:

- **USB-to-UART adapter, 3.3 V logic** (CP2102, FT232RL, CH340G — pick one with a 3V3/5V switch set to 3V3). ~$5–10.
- **4× female-female jumper wires** (the TV side is a bare edge; needs female sockets on probes).
- **Multimeter** — identify GND and 3V3 pins on the TV side before connecting. (If you don't already own one, a cheap $10–15 digital multimeter works.)
- **Needle probes or test clips** — the edge connector is bare copper; alligator clips grab too much area and short adjacent pins. Needle probes (sold as "PCB test hook kits") are safer. ~$5.

Optional (adds significant diagnostic power):

- **Logic analyzer** (Saleae clone, 8-channel, 24 MHz). ~$10. Lets you capture + decode UART without tying up the PC terminal, and lets you see non-UART pins if we find a JTAG header.
- **BGA-153/169 eMMC programmer** — only if we want to bypass lxboot entirely. See `uart-research.md` §2 for options (RT809H, Easy-JTAG Plus, UFI Box). Not needed for the first round of debug; order later if we decide to go eMMC-recovery route.

## First test when wired

1. TV off, AC unplugged.
2. Multimeter against the 4 pins (on AC) to confirm which is GND (should be 0 V to chassis) and which is +3V3 (don't connect).
3. Hook adapter: GND↔GND, adapter's RX↔TV's TX, adapter's TX↔TV's RX. Leave the TV's +3V3 pin alone.
4. On dev box: `screen /dev/ttyUSB0 115200` (or `minicom -D /dev/ttyUSB0 -b 115200`).
5. Flip DEBUG byte over SSH: `printf '\x03' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=$((0x1A1)) conv=notrunc`
6. AC-cycle the TV. Watch the terminal.

If output appears → lxboot is talking, we have a real debug channel.
If silent at 115200 → try 9600.
If silent at both → the 4-pin header on this PCB isn't the UART, or pins are mis-ordered. Open the back, photograph the header area in good light, send a photo and we'll RE further.

## Revert DEBUG

To put the TV back to RELEASE:

```
printf '\x05' | dd of=/dev/mmcblk0p11 bs=1 count=1 seek=$((0x1A1)) conv=notrunc
```

Cold-cycle to take effect.
