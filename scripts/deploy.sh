#!/usr/bin/env bash
# Build and deploy expense-tracker to Cloudflare Pages (project: expense-tracker).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
PROJECT_NAME="${EXPENSE_PROJECT_NAME:-expense-tracker}"
npm run build
cat > dist/_redirects <<'EOF'
https://expense-tracker.pages.dev/* https://expenses.crivolotti.com/:splat 301
EOF
# Functions ship from repo root (./functions) — never use a root wrangler.toml.
npx wrangler pages deploy dist --project-name "$PROJECT_NAME" --commit-dirty=true
