/**
 * Generate D1 seed SQL for the staging demo account from public fixtures.
 *
 *   EXPENSE_OWNER=expenses.tracker.demo@gmail.com \
 *     npx tsx scripts/gen-demo-seed-sql.ts /tmp/demo-seed.sql
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseWorkbookCsv } from '../src/domain/data/parseWorkbookCsv'
import { pickScenarioColor } from '../src/domain/engine/projectionPresets'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const OWNER = process.env.EXPENSE_OWNER?.trim().toLowerCase()
if (!OWNER) throw new Error('Set EXPENSE_OWNER to the demo Cloudflare Access email')

/** Staging DB is shared; category/account ids are global PKs — offset demo rows. */
const ID_OFFSET = Number(process.env.DEMO_ID_OFFSET ?? 900_000)
const remapId = (id: number): number => ID_OFFSET + id

const csvPath =
  process.env.DEMO_CSV?.trim() ?? join(ROOT, 'fixtures/demo-staging-expenses.csv')
const scenariosPath =
  process.env.DEMO_SCENARIOS?.trim() ?? join(ROOT, 'fixtures/demo-staging-goal-scenarios.json')

const csv = readFileSync(csvPath, 'utf8')
const d = parseWorkbookCsv(csv)

interface ScenarioSeed {
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

const scenarioFile = JSON.parse(readFileSync(scenariosPath, 'utf8')) as {
  scenarios: ScenarioSeed[]
}

const str = (v: string | null | undefined): string =>
  v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
const num = (v: number): string => String(v)
const bit = (v: boolean): string => (v ? '1' : '0')
const owner = str(OWNER)

const lines: string[] = []
for (const t of [
  'transactions',
  'account_statements',
  'cash_actuals',
  'goal_scenarios',
  'categories',
  'accounts',
]) {
  lines.push(`DELETE FROM ${t} WHERE owner = ${owner};`)
}

for (const c of d.categories) {
  lines.push(
    `INSERT INTO categories (owner, id, name, monthly_budget_cents, sort_order, icon, color, active) VALUES (${owner}, ${num(remapId(c.id))}, ${str(c.name)}, ${num(c.monthlyBudgetCents)}, ${num(c.sortOrder)}, ${str(c.icon)}, ${str(c.color)}, ${bit(c.active)});`,
  )
}
for (const a of d.accounts) {
  lines.push(
    `INSERT INTO accounts (owner, id, name, kind, settlement, active) VALUES (${owner}, ${num(remapId(a.id))}, ${str(a.name)}, ${str(a.kind)}, ${str(a.settlement)}, ${bit(a.active)});`,
  )
}
for (const t of d.transactions) {
  lines.push(
    `INSERT INTO transactions (owner, id, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, notes) VALUES (${owner}, ${num(remapId(t.id))}, ${str(t.date)}, ${str(t.budgetMonth)}, ${str(t.description)}, ${num(remapId(t.accountId))}, ${num(remapId(t.categoryId))}, ${str(t.type)}, ${num(t.amountCents)}, ${bit(t.cancelled)}, ${str(t.notes)});`,
  )
}
for (const s of d.accountStatements) {
  lines.push(
    `INSERT INTO account_statements (owner, account_id, year_month, paid, paid_on) VALUES (${owner}, ${num(remapId(s.accountId))}, ${str(s.yearMonth)}, ${bit(s.paid)}, ${str(s.paidOn)});`,
  )
}
for (const c of d.cashActuals) {
  lines.push(
    `INSERT INTO cash_actuals (owner, year_month, actual_cash_cents) VALUES (${owner}, ${str(c.yearMonth)}, ${num(c.actualCashCents)});`,
  )
}

const settings = d.settings
const goals = d.goalInputs
lines.push(
  `INSERT INTO settings (owner, opening_cash_cents, opening_investment_cents, liquid_net_worth_cents) VALUES (${owner}, ${num(settings.openingCashCents)}, ${num(settings.openingInvestmentCents)}, ${num(settings.liquidNetWorthCents)}) ON CONFLICT(owner) DO UPDATE SET opening_cash_cents = excluded.opening_cash_cents, opening_investment_cents = excluded.opening_investment_cents, liquid_net_worth_cents = excluded.liquid_net_worth_cents;`,
)
lines.push(
  `INSERT INTO goal_inputs (owner, house_price_cents, down_payment_fraction, mortgage_term_years, mortgage_rate_annual, long_term_target_cents, horizon_years, expected_real_return) VALUES (${owner}, ${num(goals.housePriceCents)}, ${goals.downPaymentFraction}, ${goals.mortgageTermYears}, ${goals.mortgageRateAnnual}, ${num(goals.longTermTargetCents)}, ${goals.horizonYears}, ${goals.expectedRealReturn}) ON CONFLICT(owner) DO UPDATE SET house_price_cents = excluded.house_price_cents, down_payment_fraction = excluded.down_payment_fraction, mortgage_term_years = excluded.mortgage_term_years, mortgage_rate_annual = excluded.mortgage_rate_annual, long_term_target_cents = excluded.long_term_target_cents, horizon_years = excluded.horizon_years, expected_real_return = excluded.expected_real_return;`,
)

const usedColors: string[] = []
for (const s of scenarioFile.scenarios) {
  const color = s.color ?? pickScenarioColor(usedColors)
  usedColors.push(color)
  const purchaseYear = s.housePurchaseYear === null ? 'NULL' : String(s.housePurchaseYear)
  lines.push(
    `INSERT INTO goal_scenarios (
       owner, name, color, sort_order,
       start_invested_cents, monthly_contribution_cents, annual_contribution_growth,
       expected_real_return, horizon_years,
       house_price_cents, down_payment_fraction, house_purchase_year, transaction_costs_cents,
       mortgage_term_years, mortgage_rate_annual, house_appreciation_rate,
       rent_monthly_cents, annual_spend_cents, safe_withdrawal_rate
     ) VALUES (
       ${owner}, ${str(s.name)}, ${str(color)}, ${s.sortOrder},
       ${s.startInvestedCents}, ${s.monthlyContributionCents}, ${s.annualContributionGrowth},
       ${s.expectedRealReturn}, ${s.horizonYears},
       ${s.housePriceCents}, ${s.downPaymentFraction}, ${purchaseYear}, ${s.transactionCostsCents},
       ${s.mortgageTermYears}, ${s.mortgageRateAnnual}, ${s.houseAppreciationRate},
       ${s.rentMonthlyCents}, ${s.annualSpendCents}, ${s.safeWithdrawalRate}
     );`,
  )
}

const out = process.argv[2] ?? join(ROOT, '.tmp/demo-staging-seed.sql')
writeFileSync(out, lines.join('\n') + '\n')
process.stderr.write(
  `Wrote ${lines.length} statements to ${out} (txns=${d.transactions.length}, scenarios=${scenarioFile.scenarios.length})\n`,
)
