---
name: raise-the-bar
description: Complexity-scaled quality gate for a PR or diff in this repo — code quality/architecture (Haiku), UX/UI usability (Sonnet, only when UI files changed), and bugs/business-logic soundness (via /code-review, at a level chosen by diff size, not always the deepest one) — synthesized into one verdict, always printed in full as chat text. Scales from ~2 agents for a small PR to a dozen-plus only for something genuinely large or high-stakes. Only run it when the user explicitly asks ("/raise-the-bar", "run the bar-raiser", "does this PR make the app better") or when you have proposed it and the user said yes. Never invoke this automatically after finishing a PR — offer it as a question instead.
user_invocable: true
---

# Raise the bar — a right-sized PR quality gate

The goal is narrower than a normal code review: not just "is this broken,"
but "does this PR leave the app strictly better than before — as a product
and as a codebase — or does it quietly move something backwards."

**Gating rule, before anything else:** if the user typed `/raise-the-bar`
(or equivalent) themselves, that is explicit consent — proceed. If instead
*you* are the one considering suggesting this skill (e.g. right after
finishing a PR), do not invoke it — ask a short yes/no question first
("Want me to run the bar-raiser review on this before you merge?"). Even at
its cheapest, this spawns more than one agent; it should never run silently.

**Terminology check, so a future run doesn't misdiagnose its own cost:**
when this skill's own two subagents run, they are genuinely independent
subagents you spawned. `/code-review`, though, does not always run as an
isolated subagent — at everything short of `ultra` it loads its review
playbook directly into *your* context, and *you* (the top-level session)
become the one issuing its finder-angle `Agent` calls. There is no
subagent-spawns-subagents nesting happening. If a run of this skill ends up
firing a dozen agents, it's because you fanned out `/code-review`'s own
loaded procedure that wide yourself — controllable via the level you pick
in step 1, not evidence of runaway recursion.

**On model choice:** there is one Sonnet in the current lineup (Sonnet 5) —
no separate "cheap Sonnet" tier exists to reach for. The real lever is
Haiku 4.5 (cheap) vs. inheriting the session's own model (Sonnet, for the
one lens that needs real judgment), not picking among Sonnet variants.

## 1. Gauge the diff, then decide how much review to run

Before spawning anything: `git diff --stat <target>` (or `gh pr diff <n>
--stat`) for file/line counts, and check whether any changed path touches a
high-stakes surface — migrations, auth (`functions/_shared/access/`),
payments, or anything under `_shared/backupService`. Also check whether any
changed file is UI-facing (`src/ui/**`, `*.tsx`, `*.module.css`) — that
decides whether the UX lens runs at all.

State your classification and resulting plan (agent count, model per lens,
`/code-review` level) to the user in one line before spawning anything, so
the cost is visible up front.

- **Small** (roughly under 150 changed lines, under 5 files, no high-stakes
  surface): the merged Haiku lens (below) alone, plus `/code-review` at
  `low`. Add the UX lens only if UI files changed.
- **Typical feature PR** (the common case — a real feature or fix, no
  high-stakes surface): merged Haiku lens + UX lens (if UI touched) +
  `/code-review` at `medium`.
- **Large or high-stakes** (a big diff, a migration/auth/payment/backup
  surface touched, or the user asks for the deep option directly): same two
  custom lenses + `/code-review` at `high` or `max`, or offer `ultra`
  (cloud multi-agent) and let the user choose rather than assuming it.

Treat `low`/`medium` as genuinely lighter passes and reserve `high`/`max`
for when the size or stakes actually call for it — that's the intended use
of `/code-review`'s own level parameter, and the main way this skill avoids
firing more review than a change warrants. This mapping is inferred from
that skill's own description ("low/medium: fewer, high-confidence findings;
high→max: broader coverage") rather than confirmed against its internals at
every level — if a `low`/`medium` run doesn't come back lighter in
practice, say so plainly in the synthesis rather than silently assuming the
scaling worked.

Also read [CLAUDE.md](../../../CLAUDE.md) (project) and skim recent related
commits (`git log --oneline -10`) so you can hand each subagent real context
about this codebase's stack and conventions, not just the raw diff.

## 2. Launch the lenses in parallel

Send everything in the same turn (one message, multiple tool calls), each
`run_in_background: true` since you need all of them before synthesizing
anyway.

**Give every spawned agent the diff directly in its prompt** (paste the
output of the `git diff`/`gh pr diff` you already ran in step 1) rather
than telling it to go fetch the diff itself — saves a redundant tool
round-trip per agent and keeps every lens looking at the exact same text.

**Resource discipline — put this in every lens's prompt, not just this
skill's own notes:**
- Do not re-run this project's lint/typecheck/test/build pipeline —
  verifying the code still works is the orchestrator's job, done once, not
  each lens's job to redo. Spend tool calls reading and reasoning about the
  diff, not re-verifying what's already been verified.
- You do not need to reach full certainty on a candidate before reporting
  it — flag what looks plausible, concisely, with the concrete reason. A
  separate synthesis step (and your own judgment re-reading the code)
  filters noise afterward; over-investing in certainty on every candidate
  is exactly the kind of cost this skill is trying to avoid.
- Stay inside the lens you were given. Don't re-derive the other lenses'
  concerns — that's redundant coverage this skill deliberately keeps to two
  custom lenses specifically to avoid.

### Lens 1 — Code quality & architecture fit (Haiku, always)
`Agent` call, `subagent_type: "general-purpose"`, `model: "haiku"`.

This merges what used to be two separate lenses — in practice they came
back with near-identical findings on a real run, so one focused pass covers
both without the second agent's cost. Prompt it to check, against the
changed files only:
- Does new code match the surrounding file's naming, comment density, and
  idioms, or does it look dropped in from elsewhere? Dead code, unused
  exports, copy-pasted blocks that should be a shared helper? Any `any` or
  loosened types versus what the surrounding code does? Over-engineered or
  too-compressed-to-read?
- Does new logic live at the right layer — this repo has real layering:
  `src/domain` is framework-agnostic business/application logic shared by
  the UI and by `functions/domain` (a symlink) on the backend; Pages
  Functions under `functions/api` are thin handlers; UI "intent" modules
  (e.g. `installmentIntent.ts`, `transactionSaveIntent.ts`) are pure
  validate-then-build functions kept separate from the components that call
  them. Has business logic leaked into a component, or UI concerns leaked
  into domain code?
- Did the change reuse an existing shared module/pattern (point it at
  `pickerOptions.ts`, the `*Intent.ts` pattern, `ExpenseActions` as known
  precedents) instead of re-implementing one? If it suggests reusing an
  existing function specifically, that suggestion is a candidate for your
  own follow-up verification in step 3, not an automatic truth — an
  existing "reusable" implementation can itself be wrong (this happened on
  a real run: the suggested reuse target had a real bug the new code
  didn't have).

Report each finding as: file:line, one-sentence problem, one-line suggested
fix, severity (blocking / worth doing / nitpick).

### Lens 2 — UX/UI & usability (inherits the session model — only if UI files changed)
`Agent` call, `subagent_type: "general-purpose"` (no `model` override).
Skip this lens entirely for a backend/domain-only diff — there's nothing to
review.

This one needs real judgment, not a checklist. Prompt it to:
- Check the PR body for screenshot evidence first (CI enforces this via
  `check:pr-screenshots` for any UI-facing diff, so its absence on an open
  PR means the check is failing or hasn't run yet — flag that directly
  rather than reviewing blind). Actually look at the change from a user's
  point of view: read the changed UI components, and read the screenshots
  themselves, not just their captions — a caption can describe the intent
  while the image shows something else.
- If the screenshots are a headless-browser capture of a native form
  control (`<input type="date">`/`type="month"`/etc.), treat that as
  necessary but not sufficient — flag explicitly whether the PR body
  acknowledges the real-device gap (see CLAUDE.md's Pull request
  conventions) rather than treating the desktop capture as proof.
- Ask whether this makes a real task easier, or just adds an option without
  reducing friction anywhere.
- Check consistency with the rest of the app's design language (spacing,
  copy tone, empty/error states, mobile vs. desktop) — an inconsistent
  one-off is a real cost even if the feature works.
- Actively look for regressions: does this make anything that used to be
  one tap/click now take more steps? Does it add a mode most users will
  never discover?
- Consider the load-bearing counterfactual: would an experienced product
  designer sign off on this, or flag something?

Severity here: regression (actively worse than before) / missed opportunity
(fine, but a clear better option exists) / polish (small, optional).

### Lens 3 — Bugs & business-logic soundness
Invoke the existing skill directly: `Skill({ skill: "code-review", args: "<same target> <level from step 1>" })`.
Do not rebuild bug-hunting from scratch — this skill already does it well
and knows this repo's patterns. If its loaded instructions have you
spawning its own finder angles directly (see the terminology note above),
apply the same resource-discipline instructions above to each of those
angle prompts too.

## 3. Wait, verify what's worth verifying yourself, then synthesize

Wait for every notification. Do not fabricate or guess at any finding while
waiting.

For anything a lens flagged that you can cheaply check yourself (read the
referenced lines, run a quick empirical test for a factual claim like a
timezone or rounding bug), do — this run's most useful catch was a lens
suggesting a "reuse this existing function" fix where the existing function
turned out to be the buggy one; a 30-second empirical check (a one-off
`node -e` repro) caught that before it shipped as a regression.

Merge everything into one report, grouped by lens, most-severe first within
each. Write a short verdict up top: **ship it**, **ship with follow-ups**
(non-blocking items filed or noted), or **needs changes before merge**
(something blocking in any lens). A single blocking finding in any one lens
withholds "ship it," even if the others are clean.

**Always print the complete findings list as chat text in your response —
not a subset, not a "see above" pointing at a tool call.** If `/code-review`
also calls `ReportFindings`, that renders to a separate panel, not into the
conversation — it does not substitute for this. A run of this skill that
ends without a full findings recap in the chat response has not finished.

Do not post the report to the PR automatically — offer to (as a single PR
comment, mirroring `/code-review --post`), and only post after an explicit
yes, same as any other outward-facing action.

## Notes

- If a lens comes back with nothing, say so plainly ("the architecture lens
  found nothing worth flagging") rather than padding the report to look
  busy.
- This skill is deliberately non-trivial in cost even at its cheapest. Do
  not chain it into a loop or run it more than once per PR revision without
  being asked.
