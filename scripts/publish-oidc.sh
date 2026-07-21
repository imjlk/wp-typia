#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY_RUN="${DRY_RUN:-0}"

PACKAGES=(
  "packages/wp-typia-block-types"
  "packages/wp-typia-dataviews"
  "packages/wp-typia-api-client"
  "packages/wp-typia-rest"
  "packages/wp-typia-block-runtime"
  "packages/wp-typia-project-tools"
  "packages/wp-typia"
  "packages/create-workspace-template"
)

read_package_field() {
  local package_json="$1"
  local field="$2"
  node -p "require(process.argv[1])[process.argv[2]]" "$package_json" "$field"
}

restore_package_state() {
  local manifest_prepared="$1"
  local publish_manifest_script="$2"
  local publish_runtime_maps_script="$3"
  local restore_status=0

  if [[ "$manifest_prepared" == "1" ]] && ! node "$publish_manifest_script" restore; then
    restore_status=1
  fi

  if [[ -f "$publish_runtime_maps_script" ]] && ! node "$publish_runtime_maps_script" restore; then
    restore_status=1
  fi

  return "$restore_status"
}

# npm registry propagation can lag briefly after a successful publish, so reruns
# should also tolerate the publish endpoint reporting "already published".

publish_package() {
  local package_dir="$1"
  local package_json="$package_dir/package.json"
  local package_name
  local package_version
  local package_main
  local publish_manifest_script="$package_dir/scripts/publish-manifest.mjs"
  local publish_runtime_maps_script="$package_dir/scripts/publish-runtime-maps.mjs"
  local publish_log
  local publish_args=("--access" "public")
  local manifest_prepared=0
  local restore_status=0

  package_name="$(read_package_field "$package_json" "name")"
  package_version="$(read_package_field "$package_json" "version")"
  package_main="$(read_package_field "$package_json" "main")"

  if [[ "$package_main" == dist/* && ! -f "${package_dir}/${package_main}" ]]; then
    echo "Refusing to publish ${package_name}@${package_version}; missing ${package_main}. Run build first."
    return 1
  fi

  if npm view "${package_name}@${package_version}" version >/dev/null 2>&1; then
    echo "Skipping ${package_name}@${package_version}; version already exists on npm."
    return
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    publish_args+=("--dry-run")
  fi

  if [[ -f "$publish_manifest_script" ]]; then
    node "$publish_manifest_script" prepare
    manifest_prepared=1
  fi

  echo "Publishing ${package_name}@${package_version}..."
  publish_log="$(mktemp)"

  if (
    cd "$package_dir"
    WP_TYPIA_SKIP_POSTPACK_RESTORE=1 npm publish "${publish_args[@]}"
  ) >"$publish_log" 2>&1; then
    restore_package_state "$manifest_prepared" "$publish_manifest_script" "$publish_runtime_maps_script" || restore_status=$?
    cat "$publish_log"
    rm -f "$publish_log"
    return "$restore_status"
  fi

  restore_package_state "$manifest_prepared" "$publish_manifest_script" "$publish_runtime_maps_script" || restore_status=$?

  cat "$publish_log"

  if grep -q "previously published versions" "$publish_log"; then
    echo "Skipping ${package_name}@${package_version}; version was already published."
    rm -f "$publish_log"
    return "$restore_status"
  fi

  rm -f "$publish_log"
  return 1
}

for package_path in "${PACKAGES[@]}"; do
  publish_package "${ROOT_DIR}/${package_path}"
done
