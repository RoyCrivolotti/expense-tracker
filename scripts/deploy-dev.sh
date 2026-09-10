#!/usr/bin/env bash
# Build and deploy expense-tracker staging (project: roy-expenses-stg).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PROJECT_NAME="${STAGING_PROJECT_NAME:-roy-expenses-stg}"
npm run build:staging

# Give each PR its own preview alias.
#
# On a pull_request run, actions/checkout leaves a detached HEAD, so wrangler's own
# `git rev-parse --abbrev-ref HEAD` resolves to the literal string "HEAD" and every PR
# lands on the same https://head.roy-expenses-stg.pages.dev — concurrent PRs silently
# overwrite each other. GITHUB_HEAD_REF is the PR's source branch and is set only on
# pull_request events, so it distinguishes that case from everything else.
#
# When it is empty (push to main via deploy.yml, or a local run) we pass no --branch and
# let wrangler resolve the branch itself. That is deliberate: this project's production
# branch is `main`, and a `main` deploy is what refreshes stg-expenses.crivolotti.com.
# The `!= main` guard exists so a PR from a branch literally named `main` (a fork, say)
# can never take that hostname over.
if [ -n "${GITHUB_HEAD_REF:-}" ] && [ "${GITHUB_HEAD_REF}" != "main" ]; then
  npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --commit-dirty=true \
    --branch "${GITHUB_HEAD_REF}"
else
  npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --commit-dirty=true
fi
