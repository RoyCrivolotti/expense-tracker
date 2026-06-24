# Expense Tracker — Portfolio Audit (June 2026, post-Goals)

**Repo:** [expense-tracker](https://github.com/RoyCrivolotti/expense-tracker)  
**HEAD reviewed:** `8425956` (Goals A-plus + native-smooth pass)  
**Prior composite grade:** **A-** portfolio / **B+** product (June 2026 pre-Goals refinement)  
**Method:** `npm run verify`, line/complexity lint gates, bundle budget, static review of Goals stack, Playwright screenshot pass with three-path demo scenarios.

---

## Executive verdict

| Lens | Grade | One-line |
| --- | --- | --- |
| **Portfolio engineering** | **A** | Standout domain layer + a Goals tab that reads like a real product, not a demo chart |
| **Consumer finance product** | **A-** | Clear, fast, grounded in real transactions; still private-only and CSV dev lacks live scenario persistence |
| **Public open-source readiness** | **Not ready** | Unchanged from [PUBLIC_READINESS.md](./PUBLIC_READINESS.md) — PII/history blocker |

**Recommendation:** Keep private. Use this audit + refreshed README screenshots for portfolio narrative. Do **not** open-source without the public-readiness checklist.

---

## Scorecard vs prior audit

| Dimension | Was | Now | Evidence |
| --- | --- | --- | --- |
| Code quality | B+ | **A-** | ESLint ≤200 lines/file, ≤60 lines/fn, complexity ≤12 — all green on `npm run verify`. `goalControlFields.tsx` sits at exactly 200 lines (watch this). |
| Architecture | A- | **A** | Goals charts on shared `LinearChart` + `ChartLegend`; projection engine in `src/domain/engine/` with new `rentVsBuy.ts`; UI reads `useDeferredValue` draft. |
| UX / clarity | B | **A-** | Intro + glossary, scenario vocabulary, legends, name-on-save, show/hide, sliders restored, six chart surfaces. |
| Native feel | B | **A-** | Tap feedback, skeleton loading, tab transitions, toasts, solid sticky bars, touch-docked SVG tooltips, PWA shell (NetworkOnly `/api`). |
| Performance | B | **A-** | Goals lazy chunk **9.9 KB gzip** (was ~108 KB with Recharts); bundle budget gate in verify. |
| Security / privacy | B+ | **B+** | PWA never caches financial API responses; row-level owner unchanged. Public PII issues remain. |
| Testing | B | **B+** | **183** tests pass; new `rentVsBuy.test.ts`, `linearScale.test.ts`. No Goals UI/component tests yet. |
| Documentation | B | **A-** | [GOALS-MODEL.md](./GOALS-MODEL.md), expanded README Goals gallery, this audit. |

---

## Goals feature — deep dive

The Goals tab is now the portfolio centerpiece. Rough surface area:

| Layer | Files | Role |
| --- | --- | --- |
| Tab shell | `GoalsTab`, `GoalControls`, `ScenarioManager`, `ScenarioChips`, `ScenarioToolbar` | Draft state, deferred chart input, scenario CRUD UX |
| Clarity | `GoalsExplainer`, intro copy, empty state | Onboarding without finance jargon |
| Charts (6) | Hero projection, composition, milestones, FIRE drawdown, rent vs buy, actual vs plan saving | Decision support aligned with finance-review themes |
| Engine | `projection.ts`, `rentVsBuy.ts`, `scenarioProjection.ts` | Pure domain; cents + real rates; tested |

### Chart inventory

| Chart | Data source | Legend | Mobile |
| --- | --- | --- | --- |
| Where you are today | Draft `startInvestedCents` vs FI target | Progress bar + text | Yes |
| Invested portfolio | Saved scenarios + unsaved draft | Per-scenario colors + names | Yes (hero) |
| Net worth composition | `projectNetWorth` for draft | Semantic tokens (investment/income/danger) | Segmented |
| Years to milestone | All visible scenarios | Color dots in matrix | Segmented |
| FIRE drawdown | FI target + `projectDrawdown` | Portfolio + FI target line | Segmented |
| Rent vs buy | `projectRentVsBuy` (symmetric net-worth model) | Rent & invest vs Buy now | Segmented |
| Actual saving vs plan | Real `computeMonthlyTotals` vs draft contribution | Actual + plan ref line | Segmented |

### UX checklist (manual / screenshot pass)

| Check | Status |
| --- | --- |
| First visit explains what the tab does | Pass |
| FIRE / SWR / FI target defined in place | Pass (collapsible glossary) |
| Scenario colors map to chart lines | Pass (legends + distinct composition palette) |
| Save / rename / duplicate / delete discoverable | Pass (labeled controls) |
| Compare many scenarios without clutter | Pass (per-scenario show/hide) |
| Percent fields scrubbable on mobile | Pass (sliders restored) |
| Slider drag stays smooth during recompute | Pass (`useDeferredValue`) |
| Charts usable on touch (tooltip docks in viewport) | Pass (SVG layer) |
| Real spending grounds the projection | Pass (saving vs plan chart) |

### Rent vs buy model (honesty note)

`projectRentVsBuy` compares **net worth** paths: renter invests down payment + monthly surplus; buyer accrues equity. Documented simplifications: constant real rent, fixed 1.5%/yr carry on home value, no selling costs. **Carry rate is not yet a UI control** — sensitivity to that assumption should be disclosed when presenting results.

---

## System-level findings (unchanged or residual)

### Critical / high (unchanged)

1. **Public readiness** — real emails/amounts in git history. See [PUBLIC_READINESS.md](./PUBLIC_READINESS.md).
2. **No FK ownership validation** on `accountId` / `categoryId` writes (medium-high from architecture review).
3. **Goals UI untested** — engine has coverage; React workflow (chips, rename-on-blur, visibility toggles) relies on manual/screenshot verification.

### Medium (new or still open)

4. **`goalControlFields.tsx` at 200-line cap** — next control added should split file.
5. **CSV dev mode** has zero saved scenarios unless `DOCS_CAPTURE=1` (screenshots seed three demo paths from `fixtures/demo-goal-scenarios.json`).
6. **Rent vs buy carry rate** hard-coded — expose in Housing section for stress-testing.
7. **No integration tests** for scenario API beyond auth patterns.

### Low

8. **Analytics** still separate chart implementation from Goals (intentional — both SVG, different layouts).
9. **Light mode** — one dashboard light screenshot; Goals gallery is dark-first (matches default).

---

## Performance snapshot

```
verify: 183 tests passed
bundle: total 107.6 KB gzip, GoalsTab 9.9 KB gzip (budget gate enforced)
PWA:    precache shell only; /api NetworkOnly
```

---

## Recommended next steps (priority)

1. **Playwright smoke test for Goals** — navigate tab, assert legend labels, toggle a scenario visibility (cheap regression guard).
2. **Expose `DEFAULT_HOME_CARRY_RATE` in Housing controls** — one percent field; keeps rent-vs-buy chart trustworthy.
3. **Split `goalControlFields.tsx`** before adding more controls (already at file limit).
4. **Optional:** seed one demo scenario in plain CSV dev mode (not only DOCS_CAPTURE) so local dev matches README screenshots.
5. Public readiness — only if open-sourcing is a goal; otherwise defer.

---

## Screenshot inventory

Regenerate: `npm run capture:screenshots` (requires Playwright Chromium).

| File | Shows |
| --- | --- |
| `goals-desktop.png` | Hero: today card, multi-line projection, three saved paths |
| `goals-desktop-explainer.png` | Glossary expanded |
| `goals-desktop-charts.png` | Secondary grid (composition, milestones, FIRE, rent, saving) |
| `goals-desktop-full.png` | Full-page scroll capture |
| `goals-mobile.png` | Mobile hero |
| `goals-mobile-explainer.png` | Mobile glossary |
| `goals-mobile-scenarios.png` | Scenario chips + save row |
| `goals-mobile-{composition,milestones,fire,rent,savings}.png` | Segmented secondary views |

Demo scenarios (`Path A/B/C`) load only when `DOCS_CAPTURE=1` (screenshot script sets this automatically).

---

*Audit performed June 24, 2026 after Goals A-plus shipment (`8425956`).*
