# Status

## Phase 0 — proof of life (done)

- 80-byte aarch64 asm payload in `payload/src/main.S`
- Packed as a single-block LZ4 image via `tools/hib-pack`
- End-to-end chain verified by indirect signal: the resume-pending byte at
  `p11[0x1AB]` flipped `'S' -> 'u'` after cold boot, which only happens on
  the hibernation-resume code path. The initial DRAM witness address was
  inside a graphics-reserved range and got overwritten by the stock
  kernel's init; phase 1 moves it to `0x02000000`.

## Phase 1 — real kernel via our hib (in progress)

Machinery built, kernel bits still to source.

Done:

1. `tools/hib-pack-multi` — multi-block LZ4 packer with destination PFNs,
   single-chunk SHA trailer. Round-trip tested against `tools/hib-unpack`.
2. `payload/src/trampoline.S` + `trampoline.ld` — Linux aarch64 entry-ABI
   bridge. Builds to 176 bytes.
3. `payload/build-kernel.sh` — combines trampoline + kernel + DTB +
   initramfs into a hib via `hib-pack-multi`.
4. `kernel/README.md` + `kernel/kernel.config.frag` — buildroot recipe for a
   generic aarch64 Linux + busybox initramfs (Path A).
5. Witness address moved to `0x02000000` (System RAM above kernel data,
   outside HMA). Pstore config fragment reserves ramoops for later phases.

Still blocked on:

- Building the kernel + DTB + initramfs. Run buildroot per
  `kernel/README.md`. `~1h` compile.
- Research track (separate repo `../b9-epk-research/`): completing the
  outer-container region map so the stock kernel binaries come out
  readable. Not required for phase 1 — the buildroot kernel is enough to
  prove the machinery.

## Phase 2 — persistence (not started)

`installer/persist-init.sh` is written but not installed. It runs at every
HBC boot and re-arms the trigger + rewrites the hib. Needs validation that
running it mid-boot doesn't fight stock `snapshot-boot-manager -d` (which
holds p48 open as its output target).

## Phase 3 — replacement rootfs (not started)

Minimal initramfs with busybox + dropbear. Mount `/dev/mmcblk0p52` (data)
for persistent `/root`. Stock LG EPKs stay intact on their own partitions so
a reflash can revert.

## Known risks, open questions

- Phase-1 hib may exceed 150 MB when kernel + DTB + initramfs are packed
  uncompressed-then-lz4. Measure before committing to the single-block
  layout.
- `compType=3 block_count=1` single-SHA path was verified on a 4 KB body.
  Pending: confirm the sampled-SHA path with block_count>=2 reads a chunk
  length we control (per prior format RE the sampler uses an LCG PRNG;
  with block_count=1 the single-chunk SHA at trailer+0x2010 is deterministic
  regardless).
- Stock `snapshot-boot-manager -m` behavior after a successful custom boot
  is unknown. It may detect "resume failed" and regenerate a fresh LG
  snapshot, undoing our hib. The persist-init hook is the planned defense.
- The compType=0 (uncompressed, no-verify) path remains available as a
  fallback but with the staging-buffer destination open question — see
  the component-a1-ct0 note in `scratchpad/grey-hat/`.
