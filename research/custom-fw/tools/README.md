# tools

Repeatable CLIs for the installer and the payload build.

Each tool prints `--help` on its own. Tools are stateless and take all
inputs as arguments or `$TV_HOST` for SSH-driven ones.

| Tool | What it does |
|------|-------------|
| `hib-pack`       | Build a 150 MB hib image around a single payload page |
| `hib-pack-multi` | Build a 150 MB hib image with multiple LZ4 blocks (trampoline + kernel + DTB + initramfs) |
| `hib-unpack`     | Print header + comp meta table + trailer of an existing hib image |
| `tv-probe`       | Read the B9's state (uptime, NVM arm bytes, hib header hash) over SSH |

Env vars respected:

- `TV_HOST`      user@ip for the SSH tools
- `SSH_OPTS`     extra ssh options (e.g. `-i ~/.ssh/b9_key`)
- `CROSS`        aarch64 cross prefix (default `aarch64-linux-gnu-`)

Dependencies:

```
A cross-toolchain for aarch64-linux-gnu (`binutils`, `gcc`), plus `python3` and `lz4`.
    python openssh
```

## Pipeline

```
# Build + pack a payload (phase 0 proof-of-life)
./payload/build.sh                                       # → payload/build/hib.img

# Or build + pack trampoline + kernel + DTB + initramfs (phase 1)
./payload/build-kernel.sh                                # → payload/build/hib.img

# Inspect any hib image
./tools/hib-unpack           path/to/hib.img  --verify-sha

# Read TV state
TV_HOST=a.b.c.d  ./tools/tv-probe

# Install / rollback
TV_HOST=a.b.c.d  ./installer/install.sh    payload/build/hib.img
TV_HOST=a.b.c.d  ./installer/uninstall.sh
```
