import { useMemo } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { AnalyticsBasis, BudgetHealth } from '../../../engine'
import {
  basisOptions,
  computeBudgetHealth,
  computeMonthlyTotals,
  computeYtdBudgetHealth,
  fullMonthLabel,
  investedYtdCents,
  shortMonthLabel,
  sumBudgetHealth,
} from '../../../engine'
import { BudgetBar } from '../../components/BudgetBar'
import { Card, Kpi, SectionTitle } from '../../components/primitives'
import tabStyles from '../../tabs/tabs.module.css'
import styles from './mobile.module.css'

interface Props {
  model: ExpenseModel
  month: string
  basis?: AnalyticsBasis
}

function budgetedBySize(budgets: BudgetHealth[]): BudgetHealth[] {
  return budgets.filter((b) => b.budgetCents > 0).sort((a, b) => b.budgetCents - a.budgetCents)
}

const BASIS_HINT: Record<AnalyticsBasis, string> = {
  committed: 'Includes forecast (unpaid card) charges.',
  paid: 'Paid charges only — unpaid card charges are left out.',
}

const BASIS_HINT_INLINE: Record<AnalyticsBasis, string> = {
  committed: 'includes forecast (unpaid card) charges',
  paid: 'paid charges only',
}

function BudgetBarsCard({
  budgets,
  lookup,
}: {
  budgets: BudgetHealth[]
  lookup: ExpenseModel['lookup']
}) {
  if (budgets.length === 0) return null
  const total = sumBudgetHealth(budgets)
  return (
    <Card>
      {budgets.map((b) => (
        <BudgetBar
          key={b.categoryId}
          name={b.name}
          icon={lookup.category(b.categoryId)?.icon}
          actualCents={b.actualCents}
          budgetCents={b.budgetCents}
          ratio={b.ratio}
          status={b.status}
        />
      ))}
      <BudgetBar
        name={total.name}
        actualCents={total.actualCents}
        budgetCents={total.budgetCents}
        ratio={total.ratio}
        status={total.status}
        total
      />
    </Card>
  )
}

export function MonthlySummaryMobile({ model, month, basis = 'committed' }: Props) {
  const { dataset, lookup } = model
  const year = month.slice(0, 4)

  const monthlyTotals = useMemo(
    () => computeMonthlyTotals(dataset.transactions, basisOptions(basis)),
    [dataset, basis],
  )

  const monthInvestedCents = monthlyTotals.get(month)?.investmentsCents ?? 0
  const ytdInvestedCents = investedYtdCents(monthlyTotals, month)

  const budgets = useMemo(() => {
    return budgetedBySize(
      computeBudgetHealth(dataset.transactions, dataset.categories, month, basisOptions(basis)),
    )
  }, [dataset, month, basis])

  const ytdBudgets = useMemo(() => {
    return budgetedBySize(
      computeYtdBudgetHealth(dataset.transactions, dataset.categories, month, basisOptions(basis)),
    )
  }, [dataset, month, basis])

  return (
    <div className={styles.section}>
      <SectionTitle>Budget vs actual</SectionTitle>
      <Card className={tabStyles.kpiGrid}>
        <Kpi
          label={`Invested (${shortMonthLabel(month)})`}
          cents={monthInvestedCents}
          type="investment"
        />
        <Kpi label={`Invested YTD (${year})`} cents={ytdInvestedCents} type="investment" />
      </Card>
      <p className={styles.hint}>Net saving may differ if cash wasn&apos;t invested yet.</p>
      <h3 className={styles.subheading}>{fullMonthLabel(month)}</h3>
      <p className={styles.hint}>{BASIS_HINT[basis]}</p>
      <BudgetBarsCard budgets={budgets} lookup={lookup} />
      <h3 className={styles.subheading}>YTD budget ({year})</h3>
      <p className={styles.hint}>
        Cumulative through {fullMonthLabel(month)} — {BASIS_HINT_INLINE[basis]}.
      </p>
      <BudgetBarsCard budgets={ytdBudgets} lookup={lookup} />
    </div>
  )
}
