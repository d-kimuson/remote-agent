#!/usr/bin/env bash

set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project_root=$(cd "$script_dir/../.." && pwd)
temp_dir="$project_root/temp-pack"
temp_cache_dir="$temp_dir/npm-cache"
temp_bin_file="$temp_dir/remote-agent"
temp_npx_file="$temp_dir/with-remote-agent-package"

echo "==> Preparing temp package directory: $temp_dir"
rm -rf "$temp_dir"
mkdir -p "$temp_dir"

echo "==> Building remote-agent"
(
  cd "$project_root"
  pnpm build
)

echo "==> Packing remote-agent"
(
  cd "$project_root"
  npm pack --pack-destination "$temp_dir" --ignore-scripts
)

output_file=$(find "$temp_dir" -maxdepth 1 -type f -name '*.tgz' | sort | tail -n 1)
if [ -z "$output_file" ]; then
  echo "error: pnpm pack did not create a tarball in $temp_dir" >&2
  exit 1
fi

cat > "$temp_bin_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail

cache_dir="$temp_cache_dir"
package_file="$output_file"

# Always use an empty cache to approximate a fresh npx install.
rm -rf "\$cache_dir"
mkdir -p "\$cache_dir"

exec npx --yes --cache "\$cache_dir" --package "\$package_file" remote-agent "\$@"
EOF

chmod +x "$temp_bin_file"

cat > "$temp_npx_file" <<EOF
#!/usr/bin/env bash
set -euo pipefail

cache_dir="$temp_cache_dir"
package_file="$output_file"

# Always use an empty cache to approximate a fresh npx install.
rm -rf "\$cache_dir"
mkdir -p "\$cache_dir"

exec npx --yes --cache "\$cache_dir" --package "\$package_file" "\$@"
EOF

chmod +x "$temp_npx_file"

cat <<EOF

Packed package is ready.
  tarball: $output_file
  runner:  $temp_bin_file
  npx env: $temp_npx_file

Examples:
  $temp_bin_file --help
  RA_DIR=$temp_dir/ra-dir $temp_bin_file serve --server-only --port 4445
  RA_DIR=$temp_dir/ra-dir $temp_bin_file serve --same-lan --port 4445
  $temp_npx_file codex-acp --help

EOF
