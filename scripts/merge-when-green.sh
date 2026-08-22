#!/usr/bin/env bash
# Merge a pull request once every check has concluded, and only if they all
# passed.
#
# This exists because branch protection needs GitHub Pro on a private repo
# (see docs/PRODUCTION-READINESS-PLAN.md §10). Without required checks,
# `gh pr merge --auto` does not queue — it merges on the spot — which is how
# PR #1 landed with a red e2e and PR #2 landed with two jobs still running.
# Delete this script the day the repo goes public or gets Pro, and set the
# checks as required instead: enforcement belongs on the server.
#
#   scripts/merge-when-green.sh 3            # wait, then merge
#   scripts/merge-when-green.sh 3 --squash   # any extra args go to `gh pr merge`
set -euo pipefail

pr="${1:?usage: merge-when-green.sh <pr-number> [gh pr merge flags...]}"
shift || true
repo="${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
interval="${MERGE_POLL_SECONDS:-30}"

printf 'Waiting for checks on %s#%s ...\n' "$repo" "$pr"
while :; do
  # `gh pr checks` exits non-zero when anything is failing or pending, so read
  # the rows rather than the exit code.
  rows="$(gh pr checks "$pr" --repo "$repo" 2>/dev/null || true)"
  if [ -z "$rows" ]; then
    printf 'No checks reported yet; waiting.\n'
  else
    pending="$(printf '%s\n' "$rows" | awk -F'\t' '$2=="pending"{print $1}')"
    failed="$(printf '%s\n' "$rows" | awk -F'\t' '$2!="pending" && $2!="pass" && $2!="skipping"{print $1": "$2}')"
    if [ -n "$failed" ]; then
      printf 'Refusing to merge — these did not pass:\n%s\n' "$failed" >&2
      exit 1
    fi
    if [ -z "$pending" ]; then
      printf 'All checks passed:\n%s\n' "$rows"
      break
    fi
    printf 'Still running: %s\n' "$(printf '%s' "$pending" | tr '\n' ' ')"
  fi
  sleep "$interval"
done

gh pr merge "$pr" --repo "$repo" "${@:---merge}"
