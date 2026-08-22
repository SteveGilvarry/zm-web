#!/usr/bin/env bash
# Tear down the seeded e2e database container. Data lives inside the
# container (db-manager.sh uses no named volume), so this also drops the data.
# Only our container is touched; zm-api's own zm-api-mysql is left alone.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

detect_runtime

if "$CONTAINER_CMD" ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$E2E_DB_CONTAINER"; then
  "$CONTAINER_CMD" rm -f "$E2E_DB_CONTAINER" >/dev/null
  info "Removed $E2E_DB_CONTAINER."
else
  info "$E2E_DB_CONTAINER does not exist; nothing to do."
fi
