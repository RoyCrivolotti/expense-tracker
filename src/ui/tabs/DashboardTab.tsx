import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import type { BudgetHealth } from '../../engine'
import {
  computeBudgetHealth,
  computeMonthlyTotals,
  filterTransactions,
} from '../../engine'
import { Card, EmptyState, Kpi, SectionTitle } from '../components/primitives'
import { SegmentedControl } from '../components/SegmentedControl'
import { BudgetBar } from '../components/BudgetBar'
import { GoalsCard } from '../components/GoalsCard'
import { CardStatementsCard } from '../components/CardStatementsCard'
import { TransactionList } from '../components/TransactionList'
import styles from './tabs.module.css'

import type { TabId } from '../nav/navItems'

interface DashboardTabProps {
  model: ExpenseModel
  month: string
  actions?: ExpenseActions | undefined
  onNavigate?: (tab: TabId) => void
}

type BudgetSort = 'size' | 'order' | 'overbudget'

const BUDGET_SORTS: { value: BudgetSort; label: string }[] = [
  { value: 'size', label: 'Budget size' },
  { value: 'order', label: 'Category order' },
  { value: 'overbudget', label: 'Most over' },
]

function budgetComparator(sort: BudgetSort, order: Map<number, number>) {
  const ord = (b: BudgetHealth) => order.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER
  return (a: BudgetHealth, b: BudgetHealth): number => {
    if (sort === 'order') return ord(a) - ord(b)
    if (sort === 'overbudget') return b.ratio - a.ratio || b.budgetCents - a.budgetCents
    return b.budgetCents - a.budgetCents || ord(a) - ord(b)
  }
}

function BudgetsSection({
  budgets,
  icons,
  sort,
  onSort,
  onOpenSettings,
}: {
  budgets: BudgetHealth[]
  icons: Map<number, string | undefined>
  sort: BudgetSort
  onSort: (sort: BudgetSort) => void
  onOpenSettings?: () => void
}) {
  return (
    <>
      <div className={styles.sectionHeader}>
        <SectionTitle>Budgets</SectionTitle>
        {budgets.length > 0 && (
          <SegmentedControl
            options={BUDGET_SORTS}
            value={sort}
            onChange={onSort}
            ariaLabel="Sort budgets"
          />
        )}
      </div>
      <Card>
        {budgets.length === 0 ? (
          <EmptyState
            actionLabel={onOpenSettings ? 'Set budgets in Settings' : undefined}
            onAction={onOpenSettings}
          >
            No budgeted categories yet.
          </EmptyState>
        ) : (
          budgets.map((b) => (
            <BudgetBar
              key={b.categoryId}
              name={b.name}
              icon={icons.get(b.categoryId)}
              actualCents={b.actualCents}
              budgetCents={b.budgetCents}
              ratio={b.ratio}
              status={b.status}
            />
          ))
        )}
      </Card>
    </>
  )
}

export function DashboardTab({ model, month, actions, onNavigate }: DashboardTabProps) {
  const { dataset, lookup } = model
  const [budgetSort, setBudgetSort] = useState<BudgetSort>('size')

  const totals = useMemo(
    () => computeMonthlyTotals(dataset.transactions, { includeForecast: true }).get(month),
    [dataset, month],
  )
  const budgets = useMemo(() => {
    const order = new Map(dataset.categories.map((c) => [c.id, c.sortOrder]))
    return computeBudgetHealth(dataset.transactions, dataset.categories, month, {
      includeForecast: true,
    })
      .filter((b) => b.budgetCents > 0)
      .sort(budgetComparator(budgetSort, order))
  }, [dataset, month, budgetSort])
  const categoryIcons = useMemo(
    () => new Map(dataset.categories.map((c) => [c.id, c.icon])),
    [dataset.categories],
  )
  const recent = useMemo(
    () => filterTransactions(dataset.transactions, { month }).slice(0, 8),
    [dataset, month],
  )

  return (
    <div className={styles.stack}>
      <Card className={styles.kpiGrid}>
        <Kpi label="Income" cents={totals?.incomeCents ?? 0} type="income" />
        <Kpi label="Expenses" cents={totals?.expensesCents ?? 0} type="expense" />
        <Kpi label="Net saving" cents={totals?.netSavingCents ?? 0} signed />
        <Kpi label="Invested" cents={totals?.investmentsCents ?? 0} type="investment" />
      </Card>

      <CardStatementsCard dataset={dataset} month={month} actions={actions} />

      <BudgetsSection
        budgets={budgets}
        icons={categoryIcons}
        sort={budgetSort}
        onSort={setBudgetSort}
        onOpenSettings={() => onNavigate?.('settings')}
      />

      <GoalsCard dataset={dataset} actions={actions} onOpenGoals={() => onNavigate?.('goals')} />

      <SectionTitle>Recent activity</SectionTitle>
      <Card>
        <TransactionList
          transactions={recent}
          lookup={lookup}
          {...(actions ? { onSelect: actions.onEdit } : {})}
        />
      </Card>
    </div>
  )
}
