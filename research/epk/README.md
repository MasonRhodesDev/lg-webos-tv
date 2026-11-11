# b9-epk-research

Research-only workspace for understanding the stock LG EPK container
format on the B9. Everything in this directory operates on **vendor-shipped
firmware files** (the `.epk` download). None of it writes to the TV.

Kept separate from `../b9-custom-fw/` so that project can stay a small,
plain firmware-installer codebase that's easy for other tooling to read
without pulling in format-decryption and stock-firmware carving work.

## Layout

```
tools/
  epk-decrypt   AES-128-ECB decrypt of a raw .epk container
  epk-extract   carve each PAK body (and its segments) from a decrypted EPK
work/
  decrypted.bin a fully-decrypted plaintext EPK body (1 GB), produced by
                tools/epk-decrypt; .gitignored
paks/
  carved PAK body files, one per segment, plus `merged_*.bin` concats;
  .gitignored
```

## Dependencies

```
pip install cryptography   # or your distro's python3-cryptography package
```

## Pipeline

```
./tools/epk-decrypt           ~/Downloads/stock.epk  work/decrypted.bin
./tools/epk-extract           work/decrypted.bin  -o  paks/
```

## Status

- Key family: the platform ID in the EPK header identifies which key
  from the published LG EPK-extraction key tables to use. Load it with
  `--key-file` or `EPK_AES_KEY`; the tool itself ships no key.
- Region table in `epk-decrypt` is incomplete for the big late region
  `[0x17e50f8c, 0x3cb85e78)` — kernel/rootfs/tvservice bodies still look
  high-entropy. A background task is enumerating the grid transitions
  there and will patch the REGIONS list.
- 4-byte per-segment index between sig and body (from EPK3_NEW format in
  `openlgtv/epk2extract/src/epk3.c`) is not yet accounted for in
  `epk-extract` — causes a 4-byte shift in extracted bodies.

## Not committed

`work/decrypted.bin`, `paks/` and anything else binary stays local — this
is TV-specific firmware content.
