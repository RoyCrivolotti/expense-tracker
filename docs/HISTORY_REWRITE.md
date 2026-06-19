# Git history rewrite (before public repo)

HEAD is scrubbed of personal emails in migrations and config. Older commits may still
contain them. Before `gh repo edit --visibility public`:

```bash
# Install: brew install git-filter-repo
cd expense-tracker

# Create a local replacements file (never commit real addresses):
cat >/tmp/expense-tracker-pii-replacements.txt <<'EOF'
owner@example.com==>owner@example.com
user2@example.com==>user2@example.com
user3@example.com==>user3@example.com
EOF

git filter-repo --replace-text /tmp/expense-tracker-pii-replacements.txt --force
rm /tmp/expense-tracker-pii-replacements.txt

git remote add origin git@github.com:RoyCrivolotti/expense-tracker.git
git push --force origin main
```

Verify no PII remains in **file content** across all commits:

```bash
git log --all -S 'owner@example.com' --oneline   # expect empty
git log --all -S 'user2@example.com' --oneline      # expect empty
git log --all -S 'user3@example.com' --oneline   # expect empty
```

`git filter-repo` removes `origin`; re-add it before pushing. Re-clone on other
machines after the force push.

After rewrite, rotate any credentials that ever appeared in history (unlikely here,
but good hygiene).
