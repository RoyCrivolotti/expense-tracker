import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { samplePlan } from '../../testing/samplePlan'
import type { GoalScenario } from '../types'
import { dateAtYears } from './dates'
import { projectNetWorth } from './projection'
import { rebaseline } from './rebaselinePatch'
import { mulberry32 } from './rng'
import { scenarioToParams } from './scenarioProjection'

/**
 * Pins what `rebaseline` returns, and the invested and net worth lines of the plan it restarts, across plans that
 * differ in every input it reads. Each digest covers one inflation and one way of dating costs, over 40 plans with
 * their own start date (or none), check-in date (before the start, on it, years after), balances against
 * contributions, house, events and changes to the monthly amount. A digest moves when any figure in its group moves,
 * so a restructuring of `rebaseline` that changes one number fails here.
 */
const STARTS = ['2024-03-01', '2024-02-29', '2023-12-31', '2026-01-01', '2020-07-15']
const PURCHASES = [null, 0, 1, 3, 6, 9]

function plans(
  seed: number,
  count: number,
): { plan: GoalScenario; date: string; invested: number }[] {
  const rand = mulberry32(seed)
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!
  return Array.from({ length: count }, () => {
    const start = rand() < 0.15 ? null : pick(STARTS)
    const plan = samplePlan({
      id: 1,
      horizonYears: pick([5, 15, 30, 40]),
      planStartDate: start,
      startInvestedCents: Math.round(rand() < 0.5 ? rand() * 400_000 : 2_000_000 + rand() * 900_000_000),
      monthlyContributionCents: Math.round(rand() < 0.2 ? 0 : rand() * 250_000),
      expectedRealReturn: rand() * 0.08,
      housePurchaseYear: pick(PURCHASES),
      housePriceCents: rand() < 0.1 ? 0 : Math.round(15_000_000 + rand() * 30_000_000),
      downPaymentFraction: 0.1 + rand() * 0.5,
      mortgageTermYears: pick([0, 15, 25, 30]),
      mortgageRateAnnual: pick([0, rand() * 0.06]),
      houseAppreciationRate: rand() * 0.05,
      annualSpendCents: Math.round(1_000_000 + rand() * 4_000_000),
      rentMonthlyCents: Math.round(rand() * 200_000),
      transactionCostsCents: Math.round(rand() * 900_000),
      lifeEvents: [
        { year: Math.floor(rand() * 20), amountCents: Math.round((rand() - 0.4) * 5_000_000), label: 'Event' },
        { year: 1 + Math.floor(rand() * 8), amountCents: -300_000, label: 'Cost' },
      ],
      contributionSchedule: rand() < 0.5 ? [] : [{ from: '2025-05', monthlyCents: Math.round(rand() * 300_000) }],
    })
    const base = start ?? '2025-06-15'
    const date = rand() < 0.1 ? dateAtYears(base, -1) : dateAtYears(base, Math.round(rand() * 120) / 10)
    // A change that begins in the month of the check-in is the amount in force there.
    if (rand() < 0.4)
      plan.contributionSchedule = [
        ...(plan.contributionSchedule ?? []),
        { from: date.slice(0, 7), monthlyCents: Math.round(rand() * 300_000) },
      ]
    return { plan, date, invested: Math.round(rand() < 0.5 ? rand() * 100_000 : rand() * 2_000_000_000) }
  })
}

const GROUPS: { inflation: number; costsEarly: boolean; digest: string }[] = [
  { inflation: 0, costsEarly: false, digest: '55cd940e96c2ea49' },
  { inflation: 0, costsEarly: true, digest: '91f94ccc6d8b7b49' },
  { inflation: 0.02, costsEarly: false, digest: 'd05af08635eff038' },
  { inflation: 0.02, costsEarly: true, digest: '956816d84400917d' },
  { inflation: -0.01, costsEarly: false, digest: 'a1aef7bc3ca13259' },
  { inflation: -0.01, costsEarly: true, digest: '32cba5e5891fc919' },
  { inflation: 0.07, costsEarly: false, digest: '7449eb727ff2b82c' },
  { inflation: 0.07, costsEarly: true, digest: '852229d630a161b5' },
]

function digestOf(
  inflation: number,
  costsEarly: boolean,
): string {
  const results = plans(7, 40).map(({ plan, date, invested }) => {
    const r = rebaseline(plan, { investedCents: invested, date }, inflation, { costsEarly })
    const line = projectNetWorth(scenarioToParams({ ...plan, ...r.patch }, inflation))
    const readings = line.filter((_, i) => i % 5 === 0).map((p) => [p.investedCents, p.netWorthCents])
    return { r, readings }
  })
  return createHash('sha256').update(JSON.stringify(results)).digest('hex').slice(0, 16)
}

describe('rebaseline across varied plans', () => {
  it.each(GROUPS)(
    'is unchanged at inflation $inflation, costs early $costsEarly',
    ({ inflation, costsEarly, digest }) => {
      expect(digestOf(inflation, costsEarly)).toBe(digest)
    },
  )
})
