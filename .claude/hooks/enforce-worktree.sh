#!/bin/bash
# Blocks Edit/Write and git-mutating Bash calls against the shared main
# checkout. Sessions must work from a worktree instead — see CLAUDE.md
# "Worktrees". Deliberate one-off override: CLAUDE_ALLOW_MAIN_CHECKOUT=1.
#
# The Edit/Write block is a hard guarantee: those tools take an absolute
# file path directly, so there's nowhere to hide. The Bash block is
# best-effort pattern matching on the command text (plus a leading `cd`,
# if the command starts with one) — it is not a shell sandbox and can be
# evaded by sufficiently indirect commands. Non-git mutations (rm, sed -i,
# shell redirects) are not covered at all.

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

BOUND='(^|[;&|([:space:]])'

case "$tool_name" in
  Edit|Write)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    [ -n "$file_path" ] && is_original_checkout "$(dirname -- "$file_path")" && deny
    ;;
  Bash)
    cwd=$(echo "$input" | jq -r '.cwd // empty')
    command=$(echo "$input" | jq -r '.tool_input.command // empty')

    # A command that opens with `cd <dir> &&` or `cd <dir>;` changes where
    # the rest of it actually runs — check that target too, not just the
    # tool call's starting cwd.
    effective_dir="$cwd"
    cd_target=$(echo "$command" | sed -nE 's/^[[:space:]]*cd[[:space:]]+"?([^"&;]+)"?[[:space:]]*(&&|;).*/\1/p' | sed -E 's/[[:space:]]+$//')
    if [ -n "$cd_target" ]; then
      case "$cd_target" in
        /*) effective_dir="$cd_target" ;;
        *)  effective_dir="$cwd/$cd_target" ;;
      esac
    fi

    if [ -n "$effective_dir" ] && is_original_checkout "$effective_dir"; then
      if echo "$command" | grep -qE "${BOUND}git[[:space:]]+(commit|push|add|rm|mv|reset|rebase|merge|restore)([[:space:]]|\$)"; then
        deny
      fi
      if echo "$command" | grep -qE "${BOUND}git[[:space:]]+stash([[:space:]]|\$)" \
        && ! echo "$command" | grep -qE "git[[:space:]]+stash[[:space:]]+(list|show)([[:space:]]|\$)"; then
        deny
      fi
      if echo "$command" | grep -qE "${BOUND}git[[:space:]]+apply([[:space:]]|\$)" \
        && ! echo "$command" | grep -qE "git[[:space:]]+apply[[:space:]]+(--check|--stat|--numstat)"; then
        deny
      fi
      if echo "$command" | grep -qE "${BOUND}git[[:space:]]+clean([[:space:]]|\$)" \
        && ! echo "$command" | grep -qE "git[[:space:]]+clean[[:space:]]+(-n|--dry-run)([[:space:]]|\$)"; then
        deny
      fi
      if echo "$command" | grep -qE "${BOUND}git[[:space:]]+branch[[:space:]]+-[dD]([[:space:]]|\$)"; then
        deny
      fi
      if echo "$command" | grep -qE "git[[:space:]]+checkout([[:space:]]+[^[:space:]]+)?[[:space:]]+--([[:space:]]|\$)"; then
        deny
      fi
    fi
    ;;
esac

exit 0
