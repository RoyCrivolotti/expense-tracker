import { formatCentsCompact, projectNetWorth, scenarioToParams, yearsToFi, type MoneyFormat } from '../../../engine'
import type { NewGoalScenario } from '../../../data/dataSource'
import { bothMoneys, type BothMoneys } from './bothMoneys'

/** "about 54.341 € a year on your account in 2056", or "the same on your account in 2056". */
function onAccountPer(b: BothMoneys, unit: string): string {
  return b.same ? `the same ${b.accountLabel}` : `about ${b.account} ${unit} ${b.accountLabel}`
}

/** How far on a rent is read when no house is planned, or one is owned already: a comparison needs a year. */
const RENT_LOOKAHEAD_YEARS = 10

/**
 * Said under the spending at FI: what it is typed in, and what it comes to on the account where the plan
 * reaches FI, or at the end of the plan when it never does.
 */
export function spendMoneyHint(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  if (draft.annualSpendCents <= 0) return null
  const params = scenarioToParams({ ...draft, id: 0 }, inflationRate)
  const fiYear = yearsToFi(params, draft.annualSpendCents, draft.safeWithdrawalRate)
  const lastYear = projectNetWorth(params).length - 1
  const spend = bothMoneys({
    cents: draft.annualSpendCents,
    years: fiYear ?? lastYear,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (cents) => formatCentsCompact(cents, format),
  })
  const when = fiYear != null ? 'the year the plan reaches FI' : 'when the plan ends (FI is not reached)'
  return `Counted in ${spend.planLabel}: ${onAccountPer(spend, 'a year')}, ${when}.`
}

/**
 * Said under the rent: it is counted in the plan's euros, so on the account it rises with the inflation, and
 * this gives what it comes to in the year the house is bought (or ten years on, with none to buy).
 */
export function rentMoneyHint(draft: NewGoalScenario, inflationRate: number, format: MoneyFormat): string | null {
  if (draft.rentMonthlyCents <= 0) return null
  const year = draft.housePurchaseYear
  const buys = year !== null && year > 0
  const rent = bothMoneys({
    cents: draft.rentMonthlyCents,
    years: buys ? year : RENT_LOOKAHEAD_YEARS,
    planStartDate: draft.planStartDate,
    inflationRate,
    money: (cents) => formatCentsCompact(cents, format),
  })
  return `Counted in ${rent.planLabel} and rising with inflation: ${onAccountPer(rent, 'a month')}, ${buys ? 'the year you buy' : 'ten years on'}.`
}
