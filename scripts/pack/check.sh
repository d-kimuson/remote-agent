#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_root=$(cd "$script_dir/../.." && pwd)
runner="$project_root/temp-pack/remote-agent"
ra_dir="$project_root/temp-pack/ra-dir"

"$script_dir/pack.sh"

echo "==> Checking packed remote-agent CLI"
"$runner" --help >/dev/null
"$runner" token --help >/dev/null
"$runner" serve --help >/dev/null
"$project_root/temp-pack/with-remote-agent-package" codex-acp --help >/dev/null

echo "==> Checking packed runtime can start and stay alive briefly"
rm -rf "$ra_dir"
mkdir -p "$ra_dir"

log_file="$project_root/temp-pack/server.log"
RA_DIR="$ra_dir" RA_RUNTIME=production "$runner" serve --server-only --port 0 >"$log_file" 2>&1 &
pid=$!

cleanup() {
  if kill -0 "$pid" 2>/dev/null; then
    kill -INT "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sleep 3
if ! kill -0 "$pid" 2>/dev/null; then
  echo "error: packed remote-agent exited early" >&2
  cat "$log_file" >&2
  exit 1
fi

cleanup
trap - EXIT

echo "Packed remote-agent smoke check passed."
