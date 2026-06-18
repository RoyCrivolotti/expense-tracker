/**
 * Generate a D1 seed SQL file from the Numbers CSV export. Lets us seed/re-seed
 * the remote D1 headlessly (no browser / Access round-trip):
 *
 *   FINANCIAL_REVIEW_DIR=~/Repos/personal/finance-review \
 *     npx tsx scripts/gen-seed-sql.ts /tmp/seed.sql
 *   npx wrangler d1 execute roy-expenses --remote --file=/tmp/seed.sql
 *
 * All rows belong to OWNER (row-level multi-tenancy); the DELETEs only clear
 * that owner's data so re-seeding never touches other users. Status is never
 * seeded — it is derived at runtime from account settlement + statement paid
 * flags.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseWorkbookCsv } from '../src/data/parseWorkbookCsv'

/** The seed file belongs to Roy; matches the backfill in 0003_multi_user.sql. */
const OWNER = 'owner@example.com'

const dir = process.env.FINANCIAL_REVIEW_DIR
if (!dir) throw new Error('Set FINANCIAL_REVIEW_DIR to the finance-review checkout')

const csv = readFileSync(`${dir}/data/expenses_v3.csv`, 'utf8')
const d = parseWorkbookCsv(csv)

const str = (v: string | null | undefined): string =>
  v == null ? 'NULL' : `'${v.replace(/'/g, "''")}'`
const num = (v: number): string => String(v)
const bit = (v: boolean): string => (v ? '1' : '0')
const owner = str(OWNER)

// No explicit BEGIN/COMMIT: `wrangler d1 execute --file` runs the whole file as
// one atomic batch and rejects SQL transaction statements.
const lines: string[] = []
for (const t of ['transactions', 'account_statements', 'cash_actuals', 'categories', 'accounts']) {
  lines.push(`DELETE FROM ${t} WHERE owner = ${owner};`)
}
for (const c of d.categories) {
  lines.push(
    `INSERT INTO categories (owner, id, name, monthly_budget_cents, sort_order, icon, color, active) VALUES (${owner}, ${num(c.id)}, ${str(c.name)}, ${num(c.monthlyBudgetCents)}, ${num(c.sortOrder)}, ${str(c.icon)}, ${str(c.color)}, ${bit(c.active)});`,
  )
}
for (const a of d.accounts) {
  lines.push(
    `INSERT INTO accounts (owner, id, name, kind, settlement, active) VALUES (${owner}, ${num(a.id)}, ${str(a.name)}, ${str(a.kind)}, ${str(a.settlement)}, ${bit(a.active)});`,
  )
}
for (const t of d.transactions) {
  lines.push(
    `INSERT INTO transactions (owner, id, date, budget_month, description, account_id, category_id, type, amount_cents, cancelled, notes) VALUES (${owner}, ${num(t.id)}, ${str(t.date)}, ${str(t.budgetMonth)}, ${str(t.description)}, ${num(t.accountId)}, ${num(t.categoryId)}, ${str(t.type)}, ${num(t.amountCents)}, ${bit(t.cancelled)}, ${str(t.notes)});`,
  )
}
for (const s of d.accountStatements) {
  lines.push(
    `INSERT INTO account_statements (owner, account_id, year_month, paid, paid_on) VALUES (${owner}, ${num(s.accountId)}, ${str(s.yearMonth)}, ${bit(s.paid)}, ${str(s.paidOn)});`,
  )
}
for (const c of d.cashActuals) {
  lines.push(
    `INSERT INTO cash_actuals (owner, year_month, actual_cash_cents) VALUES (${owner}, ${str(c.yearMonth)}, ${num(c.actualCashCents)});`,
  )
}
const s = d.settings
const g = d.goalInputs
lines.push(
  `INSERT INTO settings (owner, opening_cash_cents, opening_investment_cents, liquid_net_worth_cents) VALUES (${owner}, ${num(s.openingCashCents)}, ${num(s.openingInvestmentCents)}, ${num(s.liquidNetWorthCents)}) ON CONFLICT(owner) DO UPDATE SET opening_cash_cents = excluded.opening_cash_cents, opening_investment_cents = excluded.opening_investment_cents, liquid_net_worth_cents = excluded.liquid_net_worth_cents;`,
)
lines.push(
  `INSERT INTO goal_inputs (owner, house_price_cents, down_payment_fraction, mortgage_term_years, mortgage_rate_annual, long_term_target_cents, horizon_years, expected_real_return) VALUES (${owner}, ${num(g.housePriceCents)}, ${g.downPaymentFraction}, ${g.mortgageTermYears}, ${g.mortgageRateAnnual}, ${num(g.longTermTargetCents)}, ${g.horizonYears}, ${g.expectedRealReturn}) ON CONFLICT(owner) DO UPDATE SET house_price_cents = excluded.house_price_cents, down_payment_fraction = excluded.down_payment_fraction, mortgage_term_years = excluded.mortgage_term_years, mortgage_rate_annual = excluded.mortgage_rate_annual, long_term_target_cents = excluded.long_term_target_cents, horizon_years = excluded.horizon_years, expected_real_return = excluded.expected_real_return;`,
)

const out = process.argv[2] ?? '/tmp/seed-roy-expenses.sql'
writeFileSync(out, lines.join('\n') + '\n')
process.stderr.write(
  `Wrote ${lines.length} statements to ${out} (categories=${d.categories.length} accounts=${d.accounts.length} transactions=${d.transactions.length} statements=${d.accountStatements.length} cashActuals=${d.cashActuals.length})\n`,
)
