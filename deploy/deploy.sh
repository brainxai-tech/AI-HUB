#!/usr/bin/env bash
set -Eeuo pipefail

umask 022

APP_ROOT="/opt/ai-project-hub"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
PREVIOUS_LINK="$APP_ROOT/previous"
DEPLOY_BACKUPS_DIR="$APP_ROOT/deploy-backups"
ENV_DIR="/etc/ai-project-hub"
ENV_FILE="$ENV_DIR/ai-project-hub.env"
LEGACY_ENV_FILE="/home/admin/apps/ai-project-hub/.env"
PROJECT_TOKEN_REGISTRY="/var/lib/ai-project-hub/project-tokens.json"
LEGACY_PROJECT_TOKEN_REGISTRY="/home/admin/apps/ai-project-hub/data/project-tokens.json"
UNIT_FILE="/etc/systemd/system/ai-project-hub.service"
NGINX_SITE="/etc/nginx/sites-available/idol-match-test"
LOCK_FILE="/run/lock/ai-project-hub-deploy.lock"
LOCAL_HEALTH_URL="http://127.0.0.1:4194/api/health"
PUBLIC_HEALTH_URL="http://127.0.0.1/hub/api/health"
RESTORE_LOCAL_HEALTH_URL="http://127.0.0.1:4194/api/health"
RESTORE_PUBLIC_HEALTH_URL="http://127.0.0.1/hub/api/health"

rollback_needed=0
previous_target=""
backup_dir=""
had_unit=0
had_nginx=0

log() {
  printf '[ai-project-hub-deploy] %s\n' "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage:
  sudo deploy/deploy.sh <release.tar.gz> <git-commit>
  sudo deploy/deploy.sh --activate <git-commit>
EOF
  exit 2
}

require_root() {
  [[ "${EUID:-$(id -u)}" -eq 0 ]] || die "run as root"
}

validate_commit() {
  [[ "$1" =~ ^[0-9a-f]{7,40}$ ]] || die "commit must be 7-40 lowercase hexadecimal characters"
}

atomic_link() {
  local target="$1"
  local link="$2"
  local temporary="${link}.new.$$"

  rm -f -- "$temporary"
  ln -s -- "$target" "$temporary"
  mv -Tf -- "$temporary" "$link"
}

prepare_external_state() {
  install -d -m 0755 -o root -g root "$APP_ROOT" "$RELEASES_DIR"
  install -d -m 0700 -o root -g root "$DEPLOY_BACKUPS_DIR"
  install -d -m 0750 -o root -g admin "$ENV_DIR"
  install -d -m 0700 -o admin -g admin /var/lib/ai-project-hub /var/log/ai-project-hub

  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$LEGACY_ENV_FILE" ]] || die "missing $ENV_FILE and no legacy environment file is available"
    install -m 0640 -o root -g admin "$LEGACY_ENV_FILE" "$ENV_FILE"
    log "migrated the service environment outside the release directory"
  fi

  if [[ ! -f "$PROJECT_TOKEN_REGISTRY" ]]; then
    [[ -f "$LEGACY_PROJECT_TOKEN_REGISTRY" ]] || die "missing project token registry"
    install -m 0600 -o admin -g admin "$LEGACY_PROJECT_TOKEN_REGISTRY" "$PROJECT_TOKEN_REGISTRY"
    log "migrated the project token registry outside the release directory"
  fi
}

validate_archive() {
  local archive="$1"
  local listing

  [[ -f "$archive" ]] || die "release archive not found: $archive"
  listing="$(tar -tzf "$archive")" || die "cannot read release archive"
  if grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env($|/)|(^|/)data(/|$)|(^|/)backups(/|$)|(^|/)\.git(/|$))' <<<"$listing"; then
    die "release archive contains a forbidden secret, runtime, backup, or VCS path"
  fi
}

validate_release_tree() {
  local release="$1"

  [[ -f "$release/package.json" ]] || die "release is missing package.json"
  [[ -f "$release/server.mjs" ]] || die "release is missing server.mjs"
  [[ -f "$release/public/index.html" ]] || die "release is missing public/index.html"
  [[ -f "$release/deploy/systemd/ai-project-hub.service" ]] || die "release is missing the systemd unit"
  [[ -f "$release/deploy/nginx/idol-match-test.conf" ]] || die "release is missing the Nginx site"
  [[ ! -e "$release/.env" ]] || die "release contains .env"
  [[ ! -e "$release/data" ]] || die "release contains data/"
  [[ ! -e "$release/backups" ]] || die "release contains backups/"
  [[ ! -e "$release/.git" ]] || die "release contains .git/"
}

package_release() {
  local archive="$1"
  local commit="$2"
  local release="$RELEASES_DIR/$commit"
  local temporary="$RELEASES_DIR/.${commit}.tmp.$$"

  if [[ -d "$release" ]]; then
    validate_release_tree "$release"
    [[ "$(<"$release/.release-commit")" == "$commit" ]] || die "existing release has the wrong commit marker"
    printf '%s\n' "$release"
    return
  fi

  validate_archive "$archive"
  install -d -m 0755 -o root -g root "$temporary"
  trap 'rm -rf -- "$temporary"' RETURN
  tar -xzf "$archive" -C "$temporary" --no-same-owner --no-same-permissions
  validate_release_tree "$temporary"
  printf '%s\n' "$commit" > "$temporary/.release-commit"

  find "$temporary" -type d -exec chmod 0755 {} +
  find "$temporary" -type f -exec chmod 0644 {} +
  chmod 0755 "$temporary/deploy/deploy.sh" "$temporary/deploy/rollback.sh"
  chown -R root:root "$temporary"

  log "verifying release $commit before activation" >&2
  (cd "$temporary" && npm run verify) >&2
  mv -T -- "$temporary" "$release"
  trap - RETURN
  printf '%s\n' "$release"
}

save_operational_config() {
  backup_dir="$DEPLOY_BACKUPS_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  install -d -m 0700 -o root -g root "$backup_dir"

  if [[ -f "$UNIT_FILE" ]]; then
    cp -a -- "$UNIT_FILE" "$backup_dir/ai-project-hub.service"
    had_unit=1
  fi
  if [[ -f "$NGINX_SITE" ]]; then
    cp -a -- "$NGINX_SITE" "$backup_dir/idol-match-test.conf"
    had_nginx=1
  fi
}

install_operational_config() {
  local release="$1"
  local unit_candidate="${UNIT_FILE}.candidate.$$"
  local nginx_candidate="${NGINX_SITE}.candidate.$$"

  install -m 0644 -o root -g root "$release/deploy/systemd/ai-project-hub.service" "$unit_candidate"
  install -m 0644 -o root -g root "$release/deploy/nginx/idol-match-test.conf" "$nginx_candidate"
  mv -Tf -- "$unit_candidate" "$UNIT_FILE"
  mv -Tf -- "$nginx_candidate" "$NGINX_SITE"
}

wait_for_health() {
  local url="$1"
  local attempt

  for attempt in $(seq 1 20); do
    if curl --fail --silent --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_operational_config() {
  if [[ "$had_unit" -eq 1 ]]; then
    install -m 0644 -o root -g root "$backup_dir/ai-project-hub.service" "$UNIT_FILE"
  else
    rm -f -- "$UNIT_FILE"
  fi

  if [[ "$had_nginx" -eq 1 ]]; then
    install -m 0644 -o root -g root "$backup_dir/idol-match-test.conf" "$NGINX_SITE"
  else
    rm -f -- "$NGINX_SITE"
  fi
}

rollback_deployment() {
  local failed_status="${1:-1}"

  set +e
  log "activation failed; restoring the previous release and operational configuration" >&2
  if [[ -n "$previous_target" ]]; then
    atomic_link "$previous_target" "$CURRENT_LINK"
  else
    rm -f -- "$CURRENT_LINK"
  fi
  restore_operational_config
  systemctl daemon-reload
  nginx -t
  systemctl restart ai-project-hub
  if ! wait_for_health "$RESTORE_LOCAL_HEALTH_URL"; then
    log "restored release did not pass the local health check" >&2
  fi
  systemctl reload nginx
  if ! wait_for_health "$RESTORE_PUBLIC_HEALTH_URL"; then
    log "restored release did not pass the public health check" >&2
  fi
  set -e
  return "$failed_status"
}

on_error() {
  local status="$1"
  local line="$2"

  trap - ERR
  log "command failed at line $line" >&2
  if [[ "$rollback_needed" -eq 1 ]]; then
    rollback_deployment "$status" || true
  fi
  exit "$status"
}

activate_release() {
  local release="$1"
  local old_target

  validate_release_tree "$release"
  old_target="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    die "$CURRENT_LINK exists but is not a symbolic link"
  fi

  previous_target="$old_target"
  save_operational_config
  rollback_needed=1
  install_operational_config "$release"
  atomic_link "$release" "$CURRENT_LINK"

  systemd-analyze verify "$UNIT_FILE"
  nginx -t
  systemctl daemon-reload
  systemctl restart ai-project-hub
  wait_for_health "$LOCAL_HEALTH_URL"
  systemctl reload nginx
  wait_for_health "$PUBLIC_HEALTH_URL"

  rollback_needed=0
  if [[ -n "$old_target" && "$old_target" != "$release" && "$old_target" == "$RELEASES_DIR/"* ]]; then
    atomic_link "$old_target" "$PREVIOUS_LINK"
  fi
  log "activated $(basename "$release")"
}

main() {
  local mode="package"
  local archive=""
  local commit=""
  local release=""

  require_root
  command -v flock >/dev/null || die "flock is required"
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "another deployment is already running"
  prepare_external_state

  if [[ "${1:-}" == "--activate" ]]; then
    [[ "$#" -eq 2 ]] || usage
    mode="activate"
    commit="$2"
  else
    [[ "$#" -eq 2 ]] || usage
    archive="$1"
    commit="$2"
  fi
  validate_commit "$commit"

  if [[ "$mode" == "package" ]]; then
    release="$(package_release "$archive" "$commit")"
  else
    release="$RELEASES_DIR/$commit"
    [[ -d "$release" ]] || die "release is not installed: $commit"
  fi

  activate_release "$release"
}

trap 'on_error $? $LINENO' ERR
main "$@"
