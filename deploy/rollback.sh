#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="/opt/ai-project-hub"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

die() {
  printf '[ai-project-hub-rollback] ERROR: %s\n' "$*" >&2
  exit 1
}

[[ "${EUID:-$(id -u)}" -eq 0 ]] || die "run as root"

if [[ "$#" -gt 1 ]]; then
  die "usage: sudo deploy/rollback.sh [git-commit]"
fi

if [[ "$#" -eq 1 ]]; then
  commit="$1"
  [[ "$commit" =~ ^[0-9a-f]{7,40}$ ]] || die "invalid commit"
  target="$RELEASES_DIR/$commit"
else
  target="$(readlink -f "$PREVIOUS_LINK" 2>/dev/null || true)"
  [[ -n "$target" ]] || die "no previous release is recorded"
  commit="$(basename "$target")"
fi

[[ "$target" == "$RELEASES_DIR/"* ]] || die "rollback target is outside the release directory"
[[ -d "$target" ]] || die "rollback target is not installed: $commit"
[[ "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" != "$target" ]] || die "release $commit is already current"

exec "$SCRIPT_DIR/deploy.sh" --activate "$commit"
