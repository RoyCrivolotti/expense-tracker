import { useMemo, useState } from 'react'
import type { AnalyticsBasis, SpendingGroupBy, SpendingGroupRow, SpendingSort } from '../../../engine'
import { computeSpendingGroupDetail, computeSpendingGroups, sortSpendingRows } from '../../../engine'
import { downloadCsv, monthlySummaryCsv } from '../../../data/exportCsv'
import { fullMonthLabel } from '../../../engine'
import { monthlySummaryRows } from '../monthlySummaryRows'
import type { ExpenseModel } from '../../useExpenseData'
import type { TransactionsEntry } from '../../tabs/transactionsEntry'
import { Card, EmptyState } from '../../components/primitives'
import { Modal } from '../../components/Modal'
import { PresenceValue } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MonthlySummaryGrid } from '../MonthlySummaryGrid'
import { SpendingControls } from './SpendingControls'
import type { SpendingMode } from './spendingMode'
import { presetFor } from './presetFor'
import { SpendingRow } from './SpendingRow'
import { SpendingDetailBody } from './SpendingDetailBody'
import styles from './spending.module.css'

function Detail({
  model,
  months,
  month,
  basis,
  groupBy,
  row,
  today,
  openMonth,
  onOpenTransactions,
}: {
  model: ExpenseModel
  months: string[]
  month: string
  basis: AnalyticsBasis
  groupBy: SpendingGroupBy
  row: SpendingGroupRow
  today: string
  openMonth: string
  onOpenTransactions?: ((preset: TransactionsEntry) => void) | undefined
}) {
  const detail = useMemo(
    () =>
      computeSpendingGroupDetail(
        { transactions: model.dataset.transactions, categories: model.dataset.categories },
        {
          months,
          month,
          basis,
          groupBy,
          key: row.key,
          today,
          openMonth,
          rolloverDay: model.dataset.settings.budgetRolloverDay,
        },
      ),
    [model.dataset, months, month, basis, groupBy, row.key, today, openMonth],
  )
  const preset = presetFor(groupBy, row, month, basis)
  return (
    <SpendingDetailBody
      detail={detail}
      model={model}
      onOpenTransactions={
        preset && onOpenTransactions ? () => onOpenTransactions(preset) : undefined
      }
    />
  )
}

interface Props {
  model: ExpenseModel
  month: string
  basis: AnalyticsBasis
  today: string
  /** The budget month `today` falls in (rollover-aware). */
  openMonth: string
  onOpenTransactions?: ((preset: TransactionsEntry) => void) | undefined
}

/** Where does the money go? Ranked rows with drill-down, or the exact grid with export. */
export function SpendingView({ model, month, basis, today, openMonth, onOpenTransactions }: Props) {
  const isMobile = useIsMobile()
  const [groupBy, setGroupBy] = useState<SpendingGroupBy>('category')
  const [mode, setMode] = useState<SpendingMode>('list')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // A row open for one month would reappear on another month that happens to have it, so a
  // month change closes the detail (render-phase, pre-paint, as CashView does).
  const [selectedFor, setSelectedFor] = useState(month)
  if (selectedFor !== month) {
    setSelectedFor(month)
    setSelectedKey(null)
  }

  const rows = useMemo(
    () =>
      computeSpendingGroups(
        {
          transactions: model.dataset.transactions,
          categories: model.dataset.categories,
          labels: model.dataset.labels,
        },
        {
          months: model.months,
          month,
          basis,
          today,
          openMonth,
          rolloverDay: model.dataset.settings.budgetRolloverDay,
          groupBy,
        },
      ),
    [model.dataset, model.months, month, basis, today, openMonth, groupBy],
  )
  const [sortBy, setSortBy] = useState<SpendingSort>('amount')
  const ordered = useMemo(() => sortSpendingRows(rows, sortBy), [rows, sortBy])
  const selected = rows.find((r) => r.key === selectedKey) ?? null
  const changeGroupBy = (next: SpendingGroupBy) => {
    setGroupBy(next)
    setSelectedKey(null)
  }
  const exportGrid = () => {
    downloadCsv(
      `monthly-summary-${month}.csv`,
      monthlySummaryCsv(monthlySummaryRows(model, month, basis), model.months, month.slice(0, 4)),
    )
  }

  return (
    <div className={styles.stack}>
      <SpendingControls
        mode={mode}
        onMode={setMode}
        groupBy={groupBy}
        onGroupBy={changeGroupBy}
        hasLabels={model.dataset.labels.length > 0}
        sortBy={sortBy}
        onSort={setSortBy}
        onExport={exportGrid}
      />

      {mode === 'grid' ? (
        <MonthlySummaryGrid model={model} month={month} basis={basis} />
      ) : (
        <div className={isMobile || !selected ? undefined : styles.split}>
          <Card className={styles.listCard}>
            <p className={styles.listHint}>{fullMonthLabel(month)} — tap a row for its story.</p>
            {rows.length === 0 ? (
              <EmptyState>No spending recorded for this month and grouping.</EmptyState>
            ) : (
              ordered.map((row) => (
                <SpendingRow
                  key={row.key}
                  row={row}
                  selected={row.key === selectedKey}
                  onSelect={(key) => setSelectedKey(key === selectedKey ? null : key)}
                />
              ))
            )}
          </Card>
          {!isMobile && selected && (
            <Card className={styles.detailCard}>
              <h3 className={styles.detailTitle}>{selected.name}</h3>
              <Detail
                model={model}
                months={model.months}
                month={month}
                basis={basis}
                groupBy={groupBy}
                row={selected}
                today={today}
                openMonth={openMonth}
                onOpenTransactions={onOpenTransactions}
              />
            </Card>
          )}
        </div>
      )}

      {isMobile && (
        <PresenceValue value={selected} exitMs={EXIT_MS.sheet}>
          {(row) => (
            <Modal title={row.name} subtitle={fullMonthLabel(month)} onClose={() => setSelectedKey(null)}>
              <Detail
                model={model}
                months={model.months}
                month={month}
                basis={basis}
                groupBy={groupBy}
                row={row}
                today={today}
                openMonth={openMonth}
                onOpenTransactions={onOpenTransactions}
              />
            </Modal>
          )}
        </PresenceValue>
      )}
    </div>
  )
}
