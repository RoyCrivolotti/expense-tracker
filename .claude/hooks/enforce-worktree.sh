#!/bin/bash
# Blocks Edit/Write and git-mutating Bash calls against the shared main
# checkout. Sessions must work from a worktree instead — see CLAUDE.md
# "Worktrees". Deliberate one-off override: CLAUDE_ALLOW_MAIN_CHECKOUT=1.

[ "$CLAUDE_ALLOW_MAIN_CHECKOUT" = "1" ] && exit 0

input=$(cat)
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

reason="This path is in the shared main checkout, not a worktree. Create one (git worktree add ../expense-tracker-<name> -b <branch> origin/main), then call EnterWorktree with that path before making changes. Deliberate one-off override: CLAUDE_ALLOW_MAIN_CHECKOUT=1."

deny() {
  jq -n --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 2
}

is_original_checkout() {
  # $1: a directory. A linked worktree has a .git FILE at its root; the
  # original checkout has a real .git directory.
  local toplevel
  toplevel=$(git -C "$1" rev-parse --show-toplevel 2>/dev/null) || return 1
  [ -d "$toplevel/.git" ]
}

case "$tool_name" in
  Edit|Write)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    [ -n "$file_path" ] && is_original_checkout "$(dirname -- "$file_path")" && deny
    ;;
  Bash)
    cwd=$(echo "$input" | jq -r '.cwd // empty')
    command=$(echo "$input" | jq -r '.tool_input.command // empty')
    if [ -n "$cwd" ] && is_original_checkout "$cwd"; then
      if echo "$command" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+(commit|push|add|rm|reset|rebase|merge|stash|clean|restore|apply)([[:space:]]|$)'; then
        deny
      fi
      if echo "$command" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+(branch[[:space:]]+-[dD]|checkout[[:space:]]+--)'; then
        deny
      fi
    fi
    ;;
esac

exit 0
