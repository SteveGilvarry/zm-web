#!/usr/bin/env bash
# Reload only the seed data (not the schema) into the running e2e database.
# Use between runs when a spec has mutated fixture rows.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

detect_runtime
container_running || die "$E2E_DB_CONTAINER is not running. Run e2e/seed/up.sh first."
schema_loaded    || die "$E2E_DB_CONTAINER has no ZoneMinder schema. Run e2e/seed/up.sh first."

load_seed
