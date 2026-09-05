---
name: raise-the-bar
description: Four-lens quality gate for a PR or diff in this repo — code quality/clean-code, architecture & layering fit, UX/UI & usability, and bugs/business-logic soundness (via /code-review) — synthesized into one verdict. This is heavier than a normal review (three subagents plus a full /code-review pass), so only run it when the user explicitly asks ("/raise-the-bar", "run the bar-raiser", "does this PR make the app better") or when you have proposed it and the user said yes. Never invoke this automatically after finishing a PR — offer it as a question instead.
user_invocable: true
---

# Raise the bar — four-lens PR quality gate

The goal of this skill is narrower than a normal code review: not just "is this
broken," but "does this PR leave the app strictly better than before — as a
product and as a codebase — or does it quietly move something backwards."

**Gating rule, before anything else:** if the user typed `/raise-the-bar`
(or equivalent) themselves, that is explicit consent — proceed. If instead
*you* are the one considering suggesting this skill (e.g. right after
finishing a PR), do not invoke it — ask the user a short yes/no question
first ("Want me to run the bar-raiser review on this before you merge?").
This skill spawns three subagents plus a full `/code-review` pass; it is not
a cheap default and should never run silently.

## 1. Resolve the target

Parse `args` the same way `/code-review` does: a PR number, a branch name, a
path, or nothing (meaning the current diff against the repo's default
branch). Confirm the target resolves to a real diff before spawning anything
— e.g. `gh pr diff <n>` or `git diff main...HEAD` — and stop with a clear
message if there's nothing to review.

Also read [CLAUDE.md](../../../CLAUDE.md) (project) and skim recent related
commits (`git log --oneline -10`) so you can hand each subagent real context
about this codebase's stack and conventions, not just the raw diff.

## 2. Launch three subagents in parallel, plus one /code-review pass

Send all four in the same turn (one message, multiple tool calls), each
`run_in_background: true` since you need all four before synthesizing
anyway. Each subagent prompt must include: the target (PR number or diff
range), the full list of changed files, and a pointer to read CLAUDE.md
itself rather than relying on a summary from you.

### Lens A — Code quality & idiom fit (Haiku, cheap)
`Agent` call, `subagent_type: "general-purpose"`, `model: "haiku"`.

Prompt it to check, against the changed files only:
- Does new code match the surrounding file's naming, comment density, and
  idioms, or does it look like it was dropped in from a different codebase?
- Any dead code, unused exports/imports, unreachable branches, or
  copy-pasted blocks that should be a shared helper?
- Type safety: any `any`, unnecessary casts, or loosened types versus what
  the surrounding code does?
- Is anything more complex than the problem needs (over-engineering), or
  conversely too clever/compressed to read at a glance?

Ask it to report each finding as: file:line, one-sentence problem, one-line
suggested fix, and a severity (blocking / worth doing / nitpick).

### Lens B — Architecture & layering fit (Haiku, cheap)
`Agent` call, `subagent_type: "general-purpose"`, `model: "haiku"`.

This repo has real layering: `src/domain` is framework-agnostic
business/application logic shared by the UI and by `functions/domain` (a
symlink) on the backend; Pages Functions under `functions/api` are thin
handlers; UI "intent" modules (e.g. `installmentIntent.ts`,
`transactionSaveIntent.ts`) are pure validate-then-build functions kept
separate from the React components that call them. Prompt the subagent to
check:
- Does new logic live at the right layer (domain vs. UI vs. functions), or
  has business logic leaked into a component, or UI concerns leaked into
  domain code?
- Did the change reuse an existing shared module/pattern where one already
  existed, instead of re-implementing it? (Point it at `pickerOptions.ts`,
  the `*Intent.ts` pattern, `ExpenseActions`, etc. as known precedents to
  check against.)
- Does it introduce a new pattern where reusing an existing one would have
  been more consistent — and if so, is that a deliberate, justified choice?
- Any layering violation that will make this harder to test or reuse later?

Same reporting format as Lens A.

### Lens C — UX/UI & usability (Sonnet — omit `model` to inherit)
`Agent` call, `subagent_type: "general-purpose"` (no `model` override).

This one needs real judgment, not a checklist. Prompt it to:
- Actually look at the change from a user's point of view: read the changed
  UI components, and if the PR has screenshots (check PR comments/body),
  read those too.
- Ask whether this makes a real task easier, or just adds an option without
  reducing friction anywhere.
- Check consistency with the rest of the app's design language (spacing,
  copy tone, empty/error states, mobile vs. desktop behavior) — an
  inconsistent one-off is a real cost even if the feature works.
- Actively look for regressions: does this change make anything that used
  to be one tap/click now take more steps? Does it add a mode or toggle
  that most users will never discover?
- Consider the load-bearing counterfactual: would a reasonable, experienced
  product designer sign off on this, or flag something?

Report findings the same way, but severity here is framed as: regression
(actively worse than before) / missed opportunity (fine, but a clear better
option exists) / polish (small, optional).

### Lens D — Bugs & business-logic soundness
Invoke the existing skill directly: `Skill({ skill: "code-review", args: "<same target> high" })`
(use `ultra` instead of `high` only if the user asked for the deep cloud
review, or ask them which they want when the PR is large/high-stakes). Do
not rebuild bug-hunting from scratch — this skill already does it well and
knows this repo's patterns for correctness issues.

## 3. Wait for all four, then synthesize

Wait for the three subagent notifications and the code-review result. Do
not fabricate or guess at any of their findings while waiting.

Merge everything into one report, grouped by lens, most-severe first within
each. Do not just concatenate four separate reports — write a short verdict
up top: **ship it**, **ship with follow-ups** (non-blocking items filed or
noted), or **needs changes before merge** (something blocking in any lens).
A single blocking finding in any one lens is enough to withhold "ship it,"
even if the other three lenses are clean — the point of this skill is that
all four dimensions have to hold, not that they average out.

Present this to the user in the terminal. Do not post it to the PR
automatically — offer to (as a single PR comment, mirroring `/code-review
--post`), and only post after an explicit yes, same as any other
outward-facing action.

## Notes

- If a lens subagent comes back with nothing, say so plainly ("Lens B found
  nothing worth flagging") rather than padding the report to look busy.
- This skill is deliberately expensive. Do not chain it into a loop or run
  it more than once per PR revision without being asked.
