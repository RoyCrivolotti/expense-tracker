import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface GoalScenarioSeedEntry {
  name: string
  color?: string
  sortOrder: number
  startInvestedCents: number
  monthlyContributionCents: number
  annualContributionGrowth: number
  expectedRealReturn: number
  horizonYears: number
  housePriceCents: number
  downPaymentFraction: number
  housePurchaseYear: number | null
  transactionCostsCents: number
  mortgageTermYears: number
  mortgageRateAnnual: number
  houseAppreciationRate: number
  rentMonthlyCents: number
  annualSpendCents: number
  safeWithdrawalRate: number
}

export interface GoalScenarioSeedFile {
  scenarios: GoalScenarioSeedEntry[]
}

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444'] as const

function resolveSeedPath(): string {
  const local = join(process.cwd(), 'config/goal-scenarios.seed.json')
  if (existsSync(local)) return local

  const frDir = process.env.FINANCIAL_REVIEW_DIR?.trim()
  if (frDir) {
    const fr = join(frDir, 'config/goal-scenarios.seed.json')
    if (existsSync(fr)) return fr
  }

  throw new Error(
    'Goal scenario seed not found. Copy config/goal-scenarios.seed.example.json to ' +
      'config/goal-scenarios.seed.json, or add config/goal-scenarios.seed.json under FINANCIAL_REVIEW_DIR.',
  )
}

export function loadGoalScenarioSeed(): GoalScenarioSeedFile {
  const raw = JSON.parse(readFileSync(resolveSeedPath(), 'utf8')) as GoalScenarioSeedFile
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0) {
    throw new Error('goal-scenarios.seed.json must contain a non-empty "scenarios" array')
  }

  return {
    scenarios: raw.scenarios.map((s, i) => ({
      ...s,
      color: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] ?? '#6366f1',
    })),
  }
}
