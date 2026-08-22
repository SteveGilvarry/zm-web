#!/usr/bin/env bash
# Bring up the seeded e2e database.
#
#   1. Start MariaDB 11.8 via zm-api's scripts/db-manager.sh (container
#      zm-e2e-mysql on 127.0.0.1:3308) and load the ZoneMinder schema, unless
#      the container is already up with the schema in place.
#   2. Load e2e/seed/seed.sql (idempotent).
#   3. Print the DATABASE_URL and the next commands.
#
# Env knobs (all optional): ZM_API_DIR, E2E_DB_CONTAINER, E2E_DB_PORT,
# DB_RUNTIME=docker|podman. See lib.sh for defaults.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_zm-api
detect_runtime

if container_running && schema_loaded; then
  info "$E2E_DB_CONTAINER is already running with the ZoneMinder schema; skipping schema load."
else
  info "Starting MariaDB + loading the ZoneMinder schema via $ZM_API_DIR/scripts/db-manager.sh ..."
  # db-manager.sh reads its container name / port / credentials from env.
  # It reuses a running container of that name and (re)loads the schema.
  CONTAINER_NAME_MYSQL="$E2E_DB_CONTAINER" \
  MYSQL_PORT="$E2E_DB_PORT" \
  MYSQL_DATABASE="$E2E_DB_NAME" \
  MYSQL_USER="$E2E_DB_USER" \
  MYSQL_PASSWORD="$E2E_DB_PASSWORD" \
  MYSQL_ROOT_PASSWORD="$E2E_DB_ROOT_PASSWORD" \
  DB_RUNTIME="$CONTAINER_CMD" \
    "$ZM_API_DIR/scripts/db-manager.sh" mysql
  schema_loaded || die "Schema load finished but the Monitors table is missing; check db-manager.sh output above."
fi

load_seed
print_connection
