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
WORKFLOW_ENV_FILE="/etc/ai-project-hub/agent-workflow.env"
LEGACY_ENV_FILE="/home/admin/apps/ai-project-hub/.env"
PROJECT_TOKEN_REGISTRY="/var/lib/ai-project-hub/project-tokens.json"
LEGACY_PROJECT_TOKEN_REGISTRY="/home/admin/apps/ai-project-hub/data/project-tokens.json"
WORKFLOW_DATA_DIR="/var/lib/ai-project-hub/workflow-runs"
HUB_UNIT_FILE="/etc/systemd/system/ai-project-hub.service"
WORKFLOW_UNIT_FILE="/etc/systemd/system/ai-hub-agent-workflow.service"
NGINX_SITE="/etc/nginx/sites-available/idol-match-test"
LOCK_FILE="/run/lock/ai-project-hub-deploy.lock"
LOCAL_HEALTH_URL="http://127.0.0.1:4194/api/health"
PUBLIC_HEALTH_URL="http://127.0.0.1/hub/api/health"
WORKFLOW_HEALTH_URL="http://127.0.0.1:4196/health"
RESTORE_LOCAL_HEALTH_URL="http://127.0.0.1:4194/api/health"
RESTORE_PUBLIC_HEALTH_URL="http://127.0.0.1/hub/api/health"
MIN_BUILD_AVAILABLE_KB=2097152

rollback_needed=0
previous_target=""
backup_dir=""
had_hub_unit=0
had_workflow_unit=0
had_nginx=0
hub_was_enabled=0
hub_was_running=0
workflow_was_enabled=0
workflow_was_running=0
target_has_workflow=0
package_temporary=""
package_trusted=""

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

read_workflow_token() {
  awk -F= '$1 == "WORKFLOW_API_TOKEN" { print substr($0, index($0, "=") + 1); exit }' "$WORKFLOW_ENV_FILE"
}

prepare_workflow_secret() {
  local temporary="$ENV_DIR/.agent-workflow.env.$$"
  local token=""

  if [[ ! -f "$WORKFLOW_ENV_FILE" ]]; then
    command -v openssl >/dev/null || die "openssl is required to create the workflow API token"
    token="$(openssl rand -hex 32)"
    [[ "$token" =~ ^[0-9a-f]{64}$ ]] || die "could not create a strong workflow API token"
    (umask 077 && printf 'WORKFLOW_API_TOKEN=%s\n' "$token" > "$temporary")
    install -m 0640 -o root -g admin "$temporary" "$WORKFLOW_ENV_FILE"
    rm -f -- "$temporary"
    log "created the private workflow service environment"
  fi

  token="$(read_workflow_token)"
  [[ "$token" =~ ^[A-Za-z0-9._~+/=-]{32,512}$ ]] || die "$WORKFLOW_ENV_FILE has no valid strong WORKFLOW_API_TOKEN"
  chown root:admin "$WORKFLOW_ENV_FILE"
  chmod 0640 "$WORKFLOW_ENV_FILE"
}

prepare_external_state() {
  install -d -m 0755 -o root -g root "$APP_ROOT" "$RELEASES_DIR"
  install -d -m 0700 -o root -g root "$DEPLOY_BACKUPS_DIR"
  install -d -m 0750 -o root -g admin "$ENV_DIR"
  install -d -m 0700 -o admin -g admin /var/lib/ai-project-hub /var/log/ai-project-hub
  install -d -m 0700 -o admin -g admin "$WORKFLOW_DATA_DIR"

  if [[ ! -f "$ENV_FILE" ]]; then
    [[ -f "$LEGACY_ENV_FILE" ]] || die "missing $ENV_FILE and no legacy environment file is available"
    install -m 0640 -o root -g admin "$LEGACY_ENV_FILE" "$ENV_FILE"
    log "migrated the service environment outside the release directory"
  fi

  prepare_workflow_secret

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
  if grep -Eq '(^/|(^|/)\.\.(/|$)|(^|/)\.env($|/)|^data(/|$)|^backups(/|$)|(^|/)\.git(/|$))' <<<"$listing"; then
    die "release archive contains a forbidden secret, runtime, backup, or VCS path"
  fi
}

validate_release_tree() {
  local release="$1"
  local require_workflow="${2:-1}"
  local workflow_files=0

  [[ -f "$release/package.json" ]] || die "release is missing package.json"
  [[ -f "$release/server.mjs" ]] || die "release is missing server.mjs"
  [[ -f "$release/public/index.html" ]] || die "release is missing public/index.html"
  [[ -f "$release/deploy/systemd/ai-project-hub.service" ]] || die "release is missing the Hub systemd unit"
  [[ -f "$release/deploy/nginx/idol-match-test.conf" ]] || die "release is missing the Nginx site"
  [[ ! -e "$release/.env" ]] || die "release contains .env"
  [[ ! -e "$release/data" ]] || die "release contains data/"
  [[ ! -e "$release/backups" ]] || die "release contains backups/"
  [[ ! -e "$release/.git" ]] || die "release contains .git/"

  [[ -f "$release/deploy/systemd/ai-hub-agent-workflow.service" ]] && workflow_files=$((workflow_files + 1))
  [[ -f "$release/packages/agent-workflow-runtime/server.mjs" ]] && workflow_files=$((workflow_files + 1))
  [[ -d "$release/skills" ]] && workflow_files=$((workflow_files + 1))
  if [[ "$require_workflow" -eq 1 && "$workflow_files" -ne 3 ]]; then
    die "release is missing the workflow runtime or systemd unit"
  fi
}

release_has_workflow() {
  local release="$1"
  [[ -f "$release/deploy/systemd/ai-hub-agent-workflow.service" ]] &&
    [[ -f "$release/packages/agent-workflow-runtime/server.mjs" ]] &&
    [[ -d "$release/skills" ]]
}

require_build_space() {
  local available_kb
  available_kb="$(df -Pk "$RELEASES_DIR" | awk 'NR == 2 { print $4 }')"
  [[ "$available_kb" =~ ^[0-9]+$ ]] || die "could not determine release disk availability"
  (( available_kb >= MIN_BUILD_AVAILABLE_KB )) ||
    die "at least $MIN_BUILD_AVAILABLE_KB KiB must be available to build a release"
}

install_locked_dependencies() {
  local release="$1"
  local package_dir="$2"

  require_build_space
  log "installing locked dependencies for $package_dir" >&2
  (cd "$release/$package_dir" && runuser -u admin -- env npm_config_cache="$release/.npm-cache" \
    npm ci --no-audit --no-fund) >&2
}

prepare_release_dependencies() {
  local release="$1"
  local seed="$2"
  local lock relative package_dir candidate_lock candidate_dir candidate_modules resolved_modules dependency_release linked
  local -a candidate_locks

  if [[ -n "$seed" ]]; then
    [[ -d "$seed" && "$seed" == "$RELEASES_DIR/"* ]] || die "current release is not a trusted dependency seed"
  fi
  if find "$release" -type d -name node_modules -print -quit | grep -q .; then
    die "source archive must not contain node_modules"
  fi
  : > "$release/.dependency-releases"

  while IFS= read -r -d '' lock; do
    relative="${lock#"$release/"}"
    package_dir="${relative%/package-lock.json}"
    linked=0
    candidate_locks=()
    [[ -z "$seed" ]] || candidate_locks+=("$seed/$relative")
    candidate_locks+=("$RELEASES_DIR"/*/"$relative")
    for candidate_lock in "${candidate_locks[@]}"; do
      candidate_dir="${candidate_lock%/package-lock.json}"
      candidate_modules="$candidate_dir/node_modules"
      if [[ -f "$candidate_lock" && -d "$candidate_modules" ]] && cmp -s -- "$lock" "$candidate_lock"; then
        resolved_modules="$(readlink -f "$candidate_modules")"
        [[ -d "$resolved_modules" && "$resolved_modules" == "$RELEASES_DIR/"* ]] ||
          die "dependency modules for $package_dir resolve outside the release store"
        # Turbopack refuses node_modules symlinks that resolve outside the
        # release tree.  Keep reuse space-efficient while materializing a
        # release-local directory of immutable hard links instead.
        cp -al -- "$resolved_modules" "$release/$package_dir/node_modules"
        [[ ! -L "$release/$package_dir/node_modules" ]] ||
          die "reused dependency directory for $package_dir must not be a symlink"
        if ! (cd "$release/$package_dir" && runuser -u admin -- env npm_config_cache="$release/.npm-cache" \
          npm ls --all --omit=optional --no-audit --no-fund >/dev/null 2>&1); then
          rm -rf -- "$release/$package_dir/node_modules"
          log "cached dependencies for $package_dir are incomplete; trying the next locked cache" >&2
          continue
        fi
        dependency_release="${resolved_modules#"$RELEASES_DIR/"}"
        printf '%s\n' "${dependency_release%%/*}" >> "$release/.dependency-releases"
        linked=1
        log "reused locked dependencies locally for $package_dir" >&2
        break
      fi
    done
    if [[ "$linked" -eq 0 ]]; then
      install_locked_dependencies "$release" "$package_dir"
    fi
  done < <(find "$release" -path '*/node_modules' -prune -o -type f -name package-lock.json -print0)

  sort -u -o "$release/.dependency-releases" "$release/.dependency-releases"
}

snapshot_trusted_release_files() {
  local release="$1"
  local trusted="$2"

  install -d -m 0755 -o root -g root "$trusted"
  cp -a -- "$release/deploy" "$release/scripts" "$trusted/"
  chown -hR root:root "$trusted"
  find "$trusted" -type d -exec chmod 0755 {} +
  find "$trusted" -type f -exec chmod 0644 {} +
}

restore_trusted_release_files() {
  local release="$1"
  local trusted="$2"

  chown root:root "$release"
  chmod 0755 "$release"
  rm -rf -- "$release/deploy" "$release/scripts"
  cp -a -- "$trusted/deploy" "$trusted/scripts" "$release/"
}

cleanup_package_workspace() {
  local target basename

  for target in "$package_temporary" "$package_trusted"; do
    [[ -n "$target" ]] || continue
    basename="${target#"$RELEASES_DIR/"}"
    if [[ "$target" != "$RELEASES_DIR/"* || ! "$basename" =~ ^\.[0-9a-f]{7,40}\.(tmp|trusted)\.[0-9]+$ ]]; then
      log "ERROR: refusing to clean unexpected package workspace: $target" >&2
      return 1
    fi
    rm -rf -- "$target"
  done

  package_temporary=""
  package_trusted=""
}

package_release() {
  local archive="$1"
  local commit="$2"
  local release="$RELEASES_DIR/$commit"
  local temporary="$RELEASES_DIR/.${commit}.tmp.$$"
  local trusted="$RELEASES_DIR/.${commit}.trusted.$$"

  if [[ -d "$release" ]]; then
    validate_release_tree "$release"
    [[ "$(<"$release/.release-commit")" == "$commit" ]] || die "existing release has the wrong commit marker"
    printf '%s\n' "$release"
    return
  fi

  validate_archive "$archive"
  package_temporary="$temporary"
  package_trusted="$trusted"
  install -d -m 0755 -o root -g root "$temporary"
  trap cleanup_package_workspace RETURN
  tar -xzf "$archive" -C "$temporary" --no-same-owner --no-same-permissions
  validate_release_tree "$temporary"
  require_build_space
  snapshot_trusted_release_files "$temporary" "$trusted"
  chown -hR admin:admin "$temporary"
  install -d -m 0700 -o admin -g admin "$temporary/.npm-cache"
  prepare_release_dependencies "$temporary" "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

  log "building and verifying release $commit before activation" >&2
  (cd "$temporary" && runuser -u admin -- env npm_config_cache="$temporary/.npm-cache" \
    npm run workspace:build && runuser -u admin -- env npm_config_cache="$temporary/.npm-cache" \
    npm run workspace:verify && runuser -u admin -- env AIHUB_SCAN_ROOT="$temporary" \
    AIHUB_SCAN_MANIFEST="$trusted/deploy/project-manifest.json" \
    node "$trusted/scripts/security-scan.mjs") >&2
  rm -rf -- "$temporary/.npm-cache"
  restore_trusted_release_files "$temporary" "$trusted"
  printf '%s\n' "$commit" > "$temporary/.release-commit"
  find "$temporary" -type d -exec chmod 0755 {} +
  find "$temporary" -type f -exec chmod 0644 {} +
  chmod 0755 "$temporary/deploy/deploy.sh" "$temporary/deploy/rollback.sh"
  chown -R root:root "$temporary"
  mv -T -- "$temporary" "$release"
  rm -rf -- "$trusted"
  package_temporary=""
  package_trusted=""
  trap - RETURN
  printf '%s\n' "$release"
}

save_operational_config() {
  backup_dir="$DEPLOY_BACKUPS_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$"
  install -d -m 0700 -o root -g root "$backup_dir"

  if [[ -f "$HUB_UNIT_FILE" ]]; then
    cp -a -- "$HUB_UNIT_FILE" "$backup_dir/ai-project-hub.service"
    had_hub_unit=1
  fi
  if [[ -f "$WORKFLOW_UNIT_FILE" ]]; then
    cp -a -- "$WORKFLOW_UNIT_FILE" "$backup_dir/ai-hub-agent-workflow.service"
    had_workflow_unit=1
  fi
  if [[ -f "$NGINX_SITE" ]]; then
    cp -a -- "$NGINX_SITE" "$backup_dir/idol-match-test.conf"
    had_nginx=1
  fi

  systemctl is-enabled --quiet ai-project-hub && hub_was_enabled=1 || true
  systemctl is-active --quiet ai-project-hub && hub_was_running=1 || true
  systemctl is-enabled --quiet ai-hub-agent-workflow && workflow_was_enabled=1 || true
  systemctl is-active --quiet ai-hub-agent-workflow && workflow_was_running=1 || true
}

assert_workflow_inactive() {
  if systemctl is-active --quiet ai-hub-agent-workflow; then
    log "ERROR: workflow service is still active" >&2
    return 1
  fi
}

stop_workflow_service_if_present() {
  local load_state

  load_state="$(systemctl show --property=LoadState --value ai-hub-agent-workflow)"
  if [[ "$load_state" == "not-found" ]]; then
    return 0
  fi

  systemctl disable --now ai-hub-agent-workflow
  assert_workflow_inactive
}

install_operational_config() {
  local release="$1"
  local hub_unit_candidate="${HUB_UNIT_FILE}.candidate.$$"
  local workflow_unit_candidate="${WORKFLOW_UNIT_FILE}.candidate.$$"
  local nginx_candidate="${NGINX_SITE}.candidate.$$"

  install -m 0644 -o root -g root "$release/deploy/systemd/ai-project-hub.service" "$hub_unit_candidate"
  install -m 0644 -o root -g root "$release/deploy/nginx/idol-match-test.conf" "$nginx_candidate"
  if [[ "$target_has_workflow" -eq 1 ]]; then
    install -m 0644 -o root -g root "$release/deploy/systemd/ai-hub-agent-workflow.service" "$workflow_unit_candidate"
  else
    stop_workflow_service_if_present
  fi

  mv -Tf -- "$hub_unit_candidate" "$HUB_UNIT_FILE"
  if [[ "$target_has_workflow" -eq 1 ]]; then
    mv -Tf -- "$workflow_unit_candidate" "$WORKFLOW_UNIT_FILE"
  else
    rm -f -- "$WORKFLOW_UNIT_FILE"
  fi
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

wait_for_workflow_health() {
  local attempt
  local token

  token="$(read_workflow_token)"
  [[ -n "$token" ]] || return 1
  for attempt in $(seq 1 20); do
    if printf 'header = "Authorization: Bearer %s"\n' "$token" |
      curl --fail --silent --max-time 2 --config - "$WORKFLOW_HEALTH_URL" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restore_operational_config() {
  if [[ "$had_hub_unit" -eq 1 ]]; then
    install -m 0644 -o root -g root "$backup_dir/ai-project-hub.service" "$HUB_UNIT_FILE"
  else
    rm -f -- "$HUB_UNIT_FILE"
  fi

  if [[ "$had_workflow_unit" -eq 1 ]]; then
    install -m 0644 -o root -g root "$backup_dir/ai-hub-agent-workflow.service" "$WORKFLOW_UNIT_FILE"
  else
    rm -f -- "$WORKFLOW_UNIT_FILE"
  fi

  if [[ "$had_nginx" -eq 1 ]]; then
    install -m 0644 -o root -g root "$backup_dir/idol-match-test.conf" "$NGINX_SITE"
  else
    rm -f -- "$NGINX_SITE"
  fi
}

restore_service_state() {
  local service="$1"
  local was_enabled="$2"
  local was_running="$3"

  if [[ "$was_enabled" -eq 1 ]]; then
    systemctl enable "$service"
  else
    systemctl disable "$service"
  fi

  if [[ "$was_running" -eq 1 ]]; then
    systemctl restart "$service"
  else
    systemctl stop "$service"
  fi
}

restore_service_states() {
  restore_service_state ai-project-hub "$hub_was_enabled" "$hub_was_running"
  restore_service_state ai-hub-agent-workflow "$workflow_was_enabled" "$workflow_was_running"
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
  restore_service_states
  if [[ "$hub_was_running" -eq 1 ]] && ! wait_for_health "$RESTORE_LOCAL_HEALTH_URL"; then
    log "restored release did not pass the local health check" >&2
  fi
  if [[ "$workflow_was_running" -eq 1 ]] && ! wait_for_workflow_health; then
    log "restored workflow service did not pass its authenticated health check" >&2
  fi
  systemctl reload nginx
  if [[ "$hub_was_running" -eq 1 ]] && ! wait_for_health "$RESTORE_PUBLIC_HEALTH_URL"; then
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
  if ! cleanup_package_workspace; then
    log "failed to clean the temporary package workspace" >&2
  fi
  if [[ "$rollback_needed" -eq 1 ]]; then
    rollback_deployment "$status" || true
  fi
  exit "$status"
}

activate_release() {
  local release="$1"
  local require_workflow="${2:-1}"
  local old_target

  validate_release_tree "$release" "$require_workflow"
  if release_has_workflow "$release"; then
    target_has_workflow=1
  else
    target_has_workflow=0
  fi
  old_target="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
  if [[ -e "$CURRENT_LINK" && ! -L "$CURRENT_LINK" ]]; then
    die "$CURRENT_LINK exists but is not a symbolic link"
  fi

  previous_target="$old_target"
  save_operational_config
  rollback_needed=1
  install_operational_config "$release"
  atomic_link "$release" "$CURRENT_LINK"

  if [[ "$target_has_workflow" -eq 1 ]]; then
    systemd-analyze verify "$HUB_UNIT_FILE" "$WORKFLOW_UNIT_FILE"
  else
    systemd-analyze verify "$HUB_UNIT_FILE"
  fi
  nginx -t
  systemctl daemon-reload
  if [[ "$target_has_workflow" -eq 1 ]]; then
    systemctl enable ai-project-hub ai-hub-agent-workflow
  else
    systemctl enable ai-project-hub
  fi
  systemctl restart ai-project-hub
  wait_for_health "$LOCAL_HEALTH_URL"
  if [[ "$target_has_workflow" -eq 1 ]]; then
    systemctl restart ai-hub-agent-workflow
    wait_for_workflow_health
  else
    assert_workflow_inactive
  fi
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
  local require_workflow=1

  require_root
  command -v flock >/dev/null || die "flock is required"
  command -v runuser >/dev/null || die "runuser is required"
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
    require_workflow=0
  fi

  activate_release "$release" "$require_workflow"
}

trap 'on_error $? $LINENO' ERR
main "$@"
