#!/usr/bin/env bash
# Run zm-api (from the sibling checkout) against the seeded e2e database, in
# the foreground. Ctrl-C stops it.
#
# Uses zm-api's `test-db` profile (binds 127.0.0.1, no TLS) and overrides the
# DB connection + listen port through zm-api's env layer, so no file in the
# zm-api checkout is edited. Extra args go to `cargo run` (e.g. --release).
#
# Note the double underscore after the prefix: zm-api builds its env source
# with `Environment::with_prefix("APP").prefix_separator("__")`, so the key is
# APP__DB__HOST. Its README/CLAUDE.md say APP_DB__HOST; that form is ignored
# and the profile's zm_test_user credentials win (verified 2026-08-21).
#
# Env knobs: ZM_API_DIR, E2E_DB_PORT, E2E_API_PORT (default 8089).

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_zm_api
command -v cargo >/dev/null 2>&1 || die "cargo not found; install a Rust toolchain to run zm-api."

cd "$ZM_API_DIR"

# JWT signing keys are gitignored; zm-api refuses to start without them.
if [ ! -f static/key/private_access_rsa_key.pem ]; then
  info "Generating JWT keys (scripts/generate-jwt-keys.sh) ..."
  bash scripts/generate-jwt-keys.sh
fi

export APP_PROFILE=test-db
# zm-api < 725fc75 reads APP__DB__HOST (double underscore); the fix for
# zm-api#38 switched to the documented APP_DB__HOST. Export both.
for form in APP__ APP_; do
  export "${form}DB__HOST=127.0.0.1"
  export "${form}DB__PORT=$E2E_DB_PORT"
  export "${form}DB__USERNAME=$E2E_DB_USER"
  export "${form}DB__PASSWORD=$E2E_DB_PASSWORD"
  export "${form}DB__DATABASE_NAME=$E2E_DB_NAME"
  export "${form}SERVER__ADDR=127.0.0.1"
  export "${form}SERVER__PORT=$E2E_API_PORT"
  # zm-api throttles /auth/* to 1 token/2 s with a burst of 10 per IP. That is
  # brute-force protection for a real deployment; here every worker comes from
  # 127.0.0.1 and a suite of ~100 specs trips it, turning the sign-in into a
  # flaky "Login failed". 0 disables the auth limiter (settings/base.toml).
  export "${form}SERVER__MIDDLEWARE__AUTH_RATE_LIMIT_BURST=0"
done

info "zm-api -> $DATABASE_URL, listening on $E2E_API_URL"
# No `--bin`: the crate renamed its binary zm_api -> zm-api (zm-api dccb8ef),
# and a pinned name breaks against whichever checkout you do not have. Both
# versions set `default-run`, so the bare form picks the right one.
exec cargo run "$@"
