#!/usr/bin/env bash
# Build and deploy expense-tracker preview (branch dev) — not production.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PROJECT_NAME="${EXPENSE_PROJECT_NAME:-expense-tracker}"
BRANCH="${EXPENSE_PREVIEW_BRANCH:-dev}"
npm run build:staging
# No prod pages.dev redirect on preview deploys.
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --branch "$BRANCH" --commit-dirty=true
