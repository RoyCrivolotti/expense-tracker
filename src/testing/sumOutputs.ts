/** Consumers that only add amounts (class S in docs/ENGINE-HISTORY.md), run over the linear list. */
import {
  averageMonthlySpendCents,
  balancesAtCost,
  basisOptions,
  buildStatementPayments,
  computeBudgetHealth,
  computeCategoryActuals,
  computeMonthlyTotals,
  computeOverviewKpis,
  computeSpendingBaseline,
  computeYearlyOverview,
  computeYtdBudgetHealth,
  investedYtdCents,
  monthlyFlows,
  paceMonths,
  unpaidExpenseCents,
} from '../domain/engine'
import { BASES, COMPARES, type Context, type Outputs, PERIODS } from './outputContext'

export function sumOutputs(c: Context): Outputs {
  const { ds, linear: tx, viewed, clock } = c
  const cats = ds.categories
  const cashRows = c.cashRows
  const out: Outputs = {
    categoryActuals: () => computeCategoryActuals(tx, cats, { includeForecast: true, ytdThroughMonth: viewed }),
    budgetHealth: () => computeBudgetHealth(tx, cats, viewed, { includeForecast: true }),
    ytdBudgetHealth: () => computeYtdBudgetHealth(tx, cats, viewed, { includeForecast: true }),
    categoryActualsPaid: () => computeCategoryActuals(tx, cats, { ...basisOptions('paid'), ytdThroughMonth: viewed }),
    investedYtd: () => investedYtdCents(computeMonthlyTotals(tx), viewed),
    goalsFlows: () => monthlyFlows(computeMonthlyTotals(tx)),
    yearlyOverview: () => computeYearlyOverview(tx, ds.settings),
    cashRows,
    balancesAtCost: () => balancesAtCost(cashRows(), ds.settings, tx, viewed),
    statementPayments: () =>
      buildStatementPayments(ds.accountStatements, cashRows(), ds.accounts, ds.settings.defaultAccountId),
    cashReserveSpend: () => averageMonthlySpendCents(tx, clock.openMonth),
    paceMonths: () => paceMonths(monthlyFlows(computeMonthlyTotals(tx)), '2023-04-10', clock.openMonth),
    unpaid: () => c.months.map((m) => unpaidExpenseCents(tx, m)),
    months: () => c.months,
  }
  for (const basis of BASES) {
    out[`monthlyTotals:${basis}`] = () => computeMonthlyTotals(tx, { includeForecast: basis === 'committed' })
    out[`baseline:${basis}`] = () =>
      computeSpendingBaseline(tx, ds.installmentPlans, [], { months: c.months, month: viewed, basis })
  }
  return out
}

export function kpiOutputs(c: Context): Outputs {
  const out: Outputs = {}
  for (const basis of BASES) {
    for (const period of PERIODS) {
      for (const compare of COMPARES) {
        out[`kpis:${period}:${compare}:${basis}`] = () =>
          computeOverviewKpis(c.linear, { ...c.base, months: c.months, period, compare, basis })
      }
    }
  }
  return out
}
