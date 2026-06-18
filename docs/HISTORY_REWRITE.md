# Git history rewrite (before public repo)

HEAD is scrubbed of personal emails in migrations and config. Older commits may still
contain them. Before `gh repo edit --visibility public`:

```bash
# Install: brew install git-filter-repo
cd expense-tracker
git filter-repo --replace-text <(cat <<'EOF'
owner@example.com==>owner@example.com
EOF
) --force
git push --force origin main
```

Review the diff locally first. Only run if you intend to make the repo public.

After rewrite, re-clone on other machines and rotate any credentials that ever
appeared in history (unlikely here, but good hygiene).
