/**
 * Consumers that read rows: dates, descriptions, labels, links and series (classes R, P and X in
 * docs/ENGINE-HISTORY.md). The groups and their detail also add a 12 month trend of sums, so they read
 * the linear list; the rest read only real rows.
 */
import {
  buildReimbursementLinks,
  computeAllocation,
  computeCashReconciliation,
  computeMovers,
  computeSignals,
  computeSpendingGroupDetail,
  computeSpendingGroups,
  computeSpendingPace,
  detectedFixedCosts,
  filterTransactions,
  groupTransactionsByFlag,
  latestTransactions,
  listPastReports,
  nextInstallmentSuggestion,
  paidInstallmentInMonth,
  planProgress,
  portfolioReturn,
  priorBudgetMonth,
  readReturn,
  recentlyAdded,
  splitGap,
} from '../domain/engine'
import type { Context, Outputs } from './outputContext'
import { samplePlan } from './samplePlan'

export function rowOutputs(c: Context): Outputs {
  const { ds, real: tx, linear, viewed, months, classifier, base } = c
  const cats = ds.categories
  const prev = priorBudgetMonth(viewed)
  const opts = { ...base, months, basis: 'committed' as const }
  const groups = (groupBy: 'category' | 'fixedFlexible' | 'label' | 'description') => () =>
    computeSpendingGroups({ transactions: linear, categories: cats, labels: ds.labels }, { ...opts, groupBy })
  const detail = (groupBy: 'fixedFlexible' | 'label' | 'description', key: string) => () =>
    computeSpendingGroupDetail({ transactions: linear, categories: cats }, { ...opts, groupBy, key })
  const pace = () =>
    computeSpendingPace(tx, cats, ds.installmentPlans, classifier, {
      ...base,
      basis: 'committed',
      prevMonth: months.includes(prev) ? prev : null,
    })
  const movers = () => computeMovers(tx, cats, classifier, opts)
  return {
    allocation: () => computeAllocation(tx, classifier, viewed, 'committed'),
    pace,
    movers,
    signals: () =>
      computeSignals({
        pace: pace(),
        movers: movers(),
        cashRows: computeCashReconciliation(linear, ds.accounts, ds.settings, ds.cashActuals),
        openMonth: base.openMonth,
      }),
    groupsByCategory: groups('category'),
    groupsByFixedFlexible: groups('fixedFlexible'),
    groupsByLabel: groups('label'),
    groupsByDescription: groups('description'),
    detailByFixedFlexible: detail('fixedFlexible', 'fixed'),
    detailByLabel: detail('label', '1'),
    detailByDescription: detail('description', 'rent'),
    fixedCosts: () => detectedFixedCosts(tx, ds.installmentPlans, cats, viewed),
    latestEight: () => latestTransactions(tx),
    recentlyAdded: () => recentlyAdded(tx),
    listAll: () => filterTransactions(tx, {}),
  }
}

/** Consumers that follow rows by exact date, sign or link across any month (class P). */
export function linkedOutputs(c: Context): Outputs {
  const { ds, real: tx, viewed } = c
  const plan = samplePlan({ planStartDate: '2022-01-01', startInvestedCents: 1_500_000, monthlyContributionCents: 80_000 })
  const links = () => buildReimbursementLinks(tx)
  return {
    portfolioReturn: () => portfolioReturn(ds.wealthCheckins, ds.wealthAccounts, tx),
    readReturn: () => readReturn(ds.wealthCheckins, ds.wealthAccounts, tx, plan),
    splitGap: () => splitGap(plan, ds.wealthCheckins, ds.wealthAccounts, tx, 0.02),
    flagGroups: () => groupTransactionsByFlag(tx, ds.flags),
    pastReports: () => listPastReports(tx, ds.flags),
    links: () => tx.filter((t) => t.reportCount).map((t) => links().settledBy(t.id).map((r) => r.id)),
    planProgress: () => ds.installmentPlans.map((p) => planProgress(p, tx)),
    installments: () =>
      ds.installmentPlans.map((p) => [paidInstallmentInMonth(p, tx, viewed), nextInstallmentSuggestion(p, tx, viewed)]),
  }
}
