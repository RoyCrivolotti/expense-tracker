import { useMemo, type ComponentProps } from 'react'
import type { AnalyticsBasis, SpendingGroupBy, SpendingGroupRow } from '../../../engine'
import { downloadCsv, monthlySummaryCsv } from '../../../data/exportCsv'
import { fullMonthLabel } from '../../../engine'
import { monthlySummaryRows } from '../monthlySummaryRows'
import type { ExpenseModel } from '../../useExpenseData'
import { useHistoryWatch } from '../../useHistoryWatch'
import { HistoryNote } from '../HistoryNote'
import type { TransactionsEntry } from '../../tabs/transactionsEntry'
import { Card, EmptyState } from '../../components/primitives'
import { Modal } from '../../components/Modal'
import { PresenceValue } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MonthlySummaryGrid } from '../MonthlySummaryGrid'
import { SpendingControls } from './SpendingControls'
import { presetFor } from './presetFor'
import { SpendingRow } from './SpendingRow'
import { SpendingDetailBody } from './SpendingDetailBody'
import { spendingDetail } from './spendingModel'
import { useSpendingSelection } from './useSpendingSelection'
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
    () => spendingDetail(model, { months, month, basis, groupBy, key: row.key, today, openMonth }),
    [model, months, month, basis, groupBy, row.key, today, openMonth],
  )
  const preset = presetFor(groupBy, row, month, basis)
  return (
    <SpendingDetailBody
      detail={detail}
      model={model}
      onOpenTransactions={preset && onOpenTransactions ? () => onOpenTransactions(preset) : undefined}
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
  useHistoryWatch(model)
  const isMobile = useIsMobile()
  const sel = useSpendingSelection(model, month, basis, today, openMonth)
  const { groupBy, selected, selectedKey } = sel
  const exportGrid = () => {
    downloadCsv(
      `monthly-summary-${month}.csv`,
      monthlySummaryCsv(monthlySummaryRows(model, month, basis), model.months, month.slice(0, 4)),
    )
  }

  const detailShared = { model, months: model.months, month, basis, groupBy, today, openMonth, onOpenTransactions }

  return (
    <div className={styles.stack}>
      <HistoryNote model={model} />
      <SpendingControls
        mode={sel.mode}
        onMode={sel.setMode}
        groupBy={groupBy}
        onGroupBy={sel.changeGroupBy}
        hasLabels={model.dataset.labels.length > 0}
        sortBy={sel.sortBy}
        onSort={sel.setSortBy}
        onExport={exportGrid}
      />

      {sel.mode === 'grid' ? (
        <MonthlySummaryGrid model={model} month={month} basis={basis} />
      ) : (
        <div className={isMobile || !selected ? undefined : styles.split}>
          <SpendingList
            month={month}
            rows={sel.rows}
            ordered={sel.ordered}
            selectedKey={selectedKey}
            onSelect={sel.setSelectedKey}
          />
          {!isMobile && selected && (
            <Card className={styles.detailCard}>
              <h3 className={styles.detailTitle}>{selected.name}</h3>
              <Detail {...detailShared} row={selected} />
            </Card>
          )}
        </div>
      )}

      {isMobile && (
        <PresenceValue value={selected} exitMs={EXIT_MS.sheet}>
          {(row) => (
            <MobileDetail month={month} onClose={() => sel.setSelectedKey(null)} shared={detailShared} row={row} />
          )}
        </PresenceValue>
      )}
    </div>
  )
}

function MobileDetail({
  month,
  onClose,
  shared,
  row,
}: {
  month: string
  onClose: () => void
  shared: Omit<ComponentProps<typeof Detail>, 'row'>
  row: SpendingGroupRow
}) {
  return (
    <Modal title={row.name} subtitle={fullMonthLabel(month)} onClose={onClose}>
      <Detail {...shared} row={row} />
    </Modal>
  )
}

function SpendingList({
  month,
  rows,
  ordered,
  selectedKey,
  onSelect,
}: {
  month: string
  rows: SpendingGroupRow[]
  ordered: SpendingGroupRow[]
  selectedKey: string | null
  onSelect: (key: string | null) => void
}) {
  return (
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
            onSelect={(key) => onSelect(key === selectedKey ? null : key)}
          />
        ))
      )}
    </Card>
  )
}
