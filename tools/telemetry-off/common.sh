# Shared by install.sh, uninstall.sh and verify.sh (sourced, bash).
# Reads TV_HOST / TV_USER from the environment or the repo's .env, the same
# way scripts/backup.sh does.
KIT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$KIT_DIR/../.." && pwd)
if [ -z "${TV_HOST:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$REPO_ROOT/.env"; set +a
fi
: "${TV_HOST:?set TV_HOST (env or .env)}"
TV_USER=${TV_USER:-root}
TV_DIR=/var/lib/telemetry-off              # kit data + state on the TV (rw /var)
TV_HOOK=/var/lib/webosbrew/init.d/80-telemetry-off
SSH_OPTS=${SSH_OPTS:--o BatchMode=yes -o ConnectTimeout=10 -o LogLevel=ERROR}

for t in ssh tar awk; do
  command -v "$t" >/dev/null || { echo "missing local tool: $t" >&2; exit 1; }
done

# tv CMD: run a command on the TV (no TTY).
tv() { ssh $SSH_OPTS "$TV_USER@$TV_HOST" "$@"; }

# kit_tar: the files the TV needs, as a tar stream on stdout.
kit_tar() {
  tar -C "$KIT_DIR" --owner=0 --group=0 -cf - telemetry-off.sh targets.tsv settings.tsv wipe.list \
      telemetry-off.conf.example domains
}
