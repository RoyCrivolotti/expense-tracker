#!/usr/bin/env bash
# Build and deploy expense-tracker staging (project: roy-expenses-stg).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PROJECT_NAME="${STAGING_PROJECT_NAME:-roy-expenses-stg}"
npm run build:staging
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --commit-dirty=true
