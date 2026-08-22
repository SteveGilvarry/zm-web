#!/usr/bin/env bash
# Shared settings + helpers for the seeded-e2e scripts. Source, don't run.
#
# The database is zm-api's own MariaDB test container recipe
# (scripts/db-manager.sh), started under a different container name and host
# port so it can sit next to zm-api's integration-test DB (zm-api-mysql:3307)
# without the two suites seeing each other's rows.

set -euo pipefail

SEED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DASHBOARD_DIR="$(cd "$SEED_DIR/../.." && pwd)"

# Sibling checkout of zm-api. Override with ZM_API_DIR=/path/to/zm_api.
ZM_API_DIR="${ZM_API_DIR:-$DASHBOARD_DIR/../zm_api}"
if [ -d "$ZM_API_DIR" ]; then
  ZM_API_DIR="$(cd "$ZM_API_DIR" && pwd)"
fi

E2E_DB_CONTAINER="${E2E_DB_CONTAINER:-zm-e2e-mysql}"
E2E_DB_PORT="${E2E_DB_PORT:-3308}"
E2E_DB_NAME="${E2E_DB_NAME:-zm_test}"
E2E_DB_USER="${E2E_DB_USER:-zmuser}"
E2E_DB_PASSWORD="${E2E_DB_PASSWORD:-zmpass}"
E2E_DB_ROOT_PASSWORD="${E2E_DB_ROOT_PASSWORD:-test_root_pass}"
E2E_API_PORT="${E2E_API_PORT:-8089}"

DATABASE_URL="mysql://$E2E_DB_USER:$E2E_DB_PASSWORD@127.0.0.1:$E2E_DB_PORT/$E2E_DB_NAME"
E2E_API_URL="${E2E_API_URL:-http://127.0.0.1:$E2E_API_PORT}"

info() { printf '\033[0;32m[e2e-seed]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[e2e-seed]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[0;31m[e2e-seed]\033[0m %s\n' "$*" >&2; exit 1; }

require_zm-api() {
  [ -x "$ZM_API_DIR/scripts/db-manager.sh" ] \
    || die "zm-api checkout not found at '$ZM_API_DIR' (expected scripts/db-manager.sh). Set ZM_API_DIR."
}

# Container runtime: docker (default) or podman, matching db-manager.sh's
# DB_RUNTIME knob. Native MySQL is not supported here because the seed is
# loaded through the container's own client (no host mysql binary needed).
detect_runtime() {
  case "${DB_RUNTIME:-}" in
    docker|podman) CONTAINER_CMD="$DB_RUNTIME" ;;
    "")
      if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        CONTAINER_CMD=docker
      elif command -v podman >/dev/null 2>&1; then
        CONTAINER_CMD=podman
      else
        die "Neither docker nor podman is available. Start Docker Desktop or set DB_RUNTIME."
      fi
      ;;
    *) die "Unsupported DB_RUNTIME='$DB_RUNTIME' for the seeded e2e DB (docker|podman)." ;;
  esac
  export DB_RUNTIME="$CONTAINER_CMD"
}

container_running() {
  "$CONTAINER_CMD" ps --format '{{.Names}}' 2>/dev/null | grep -qx "$E2E_DB_CONTAINER"
}

# Run the MariaDB client inside the container against the e2e database.
# Extra args are passed to the client; stdin is forwarded (for `< file.sql`).
db_exec() {
  "$CONTAINER_CMD" exec -i "$E2E_DB_CONTAINER" \
    mariadb -u"$E2E_DB_USER" -p"$E2E_DB_PASSWORD" "$E2E_DB_NAME" "$@"
}

schema_loaded() {
  local n
  n="$(db_exec -N -B -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$E2E_DB_NAME' AND TABLE_NAME='Monitors'" 2>/dev/null || echo 0)"
  [ "$n" = "1" ]
}

load_seed() {
  info "Loading $SEED_DIR/seed.sql into $E2E_DB_CONTAINER/$E2E_DB_NAME ..."
  db_exec < "$SEED_DIR/seed.sql"
  local counts
  counts="$(db_exec -N -B -e "SELECT CONCAT('monitors=', (SELECT COUNT(*) FROM Monitors WHERE Id BETWEEN 9000 AND 9999), ' events=', (SELECT COUNT(*) FROM Events WHERE Id BETWEEN 9000 AND 9999), ' logs=', (SELECT COUNT(*) FROM Logs WHERE Id BETWEEN 9000 AND 9999), ' users=', (SELECT COUNT(*) FROM Users WHERE Username LIKE 'e2e-%'))")"
  info "Seed loaded: $counts"
}

print_connection() {
  cat <<EOF

  DATABASE_URL=$DATABASE_URL
  container:    $E2E_DB_CONTAINER ($CONTAINER_CMD)
  zm-api dir:   $ZM_API_DIR

  Next: start zm-api against it and run the suite
    e2e/seed/api.sh                      # foreground; Ctrl-C to stop
    E2E_MODE=seeded npx playwright test  # in another shell

  Login: e2e-admin / e2e-admin-pass-not-secret   (see e2e/seed/README.md)
EOF
}
