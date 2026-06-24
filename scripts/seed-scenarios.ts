/**
 * Seed canonical Path 2/3/4 goal scenarios for one owner.
 *
 *   EXPENSE_OWNER=you@example.com npx tsx scripts/seed-scenarios.ts
 *   npx wrangler d1 execute roy-expenses --remote --file=/tmp/seed-scenarios.sql
 */
import { writeFileSync } from 'node:fs'
import { pathScenarioPreset } from '../src/domain/engine/projectionPresets'

const OWNER = process.env.EXPENSE_OWNER?.trim().toLowerCase()
if (!OWNER) throw new Error('Set EXPENSE_OWNER to the Cloudflare Access email')

const str = (v: string): string => `'${v.replace(/'/g, "''")}'`
const paths = ['path2', 'path3', 'path4'] as const

const lines: string[] = [
  `DELETE FROM goal_scenarios WHERE owner = ${str(OWNER)};`,
]

paths.forEach((path, i) => {
  const s = pathScenarioPreset(path, i)
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
       ${str(OWNER)}, ${str(s.name)}, ${str(s.color)}, ${s.sortOrder},
       ${s.startInvestedCents}, ${s.monthlyContributionCents}, ${s.annualContributionGrowth},
       ${s.expectedRealReturn}, ${s.horizonYears},
       ${s.housePriceCents}, ${s.downPaymentFraction}, ${purchaseYear}, ${s.transactionCostsCents},
       ${s.mortgageTermYears}, ${s.mortgageRateAnnual}, ${s.houseAppreciationRate},
       ${s.rentMonthlyCents}, ${s.annualSpendCents}, ${s.safeWithdrawalRate}
     );`,
  )
})

const out = process.argv[2] ?? '/tmp/seed-scenarios.sql'
writeFileSync(out, lines.join('\n') + '\n')
process.stderr.write(`Wrote ${lines.length} statements to ${out}\n`)
