# Git history rewrite (before public repo)

HEAD is scrubbed of personal emails in migrations and config. Before `gh repo edit --visibility public`, re-run the checks at the bottom.

## Already applied (2026-06-19)

Obsolete email-approve files were removed from all commits, unused approve-link env vars were stripped from `env.ts`, and a stray third-party email port mention was removed from the email sender port comment.

Commands used (for reference if you need to repeat on a fork):

```bash
brew install git-filter-repo
cd expense-tracker

cat >/tmp/expense-tracker-resend-replacements.txt <<'EOF'
Resend, ==>
EOF

git filter-repo --invert-paths --force \
  --path functions/_shared/access/accessNotifier.ts \
  --path functions/_shared/access/accessTokens.ts \
  --path functions/_shared/access/accessTokens.test.ts \
  --path functions/_shared/adapters/createAccessNotifier.ts \
  --path functions/api/access/approve.ts \
  --path src/ui/access/ApproveAccessScreen.tsx \
  --replace-text /tmp/expense-tracker-resend-replacements.txt

cat >/tmp/expense-tracker-access-env-replacements.txt <<'EOF'
  /** HMAC secret for signed approve links. */
  ACCESS_APPROVE_SECRET?: string
  /** Public app URL for links in emails (defaults to request origin). */
  APP_ORIGIN?: string
  ACCESS_EMAIL_FROM?: string
  ACCESS_EMAIL_FROM_NAME?: string
==>
EOF

git filter-repo --replace-text /tmp/expense-tracker-access-env-replacements.txt --force
rm /tmp/expense-tracker-*.txt

git remote add origin git@github.com:RoyCrivolotti/expense-tracker.git
git push --force origin main
```

## Optional PII replacement (real addresses only)

If real emails ever landed in commits, replace them locally (never commit the replacements file):

```bash
cat >/tmp/expense-tracker-pii-replacements.txt <<'EOF'
real@example.com==>owner@example.com
EOF
git filter-repo --replace-text /tmp/expense-tracker-pii-replacements.txt --force
rm /tmp/expense-tracker-pii-replacements.txt
```

## Verify before publishing

```bash
git log --all -S 'accessNotifier' --oneline        # expect empty
git log --all -S 'ApproveAccessScreen' --oneline   # expect empty
git log --all -S '@gmail.com' --oneline            # expect empty (real addresses)
```

`git filter-repo` removes `origin`; re-add it before pushing. Re-clone on other machines after a force push.

After rewrite, rotate any credentials that ever appeared in history (unlikely here, but good hygiene).
