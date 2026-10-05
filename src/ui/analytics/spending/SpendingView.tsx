import { useMemo, useState } from 'react'
import type { AnalyticsBasis, SpendingGroupBy, SpendingGroupRow } from '../../../engine'
import { computeSpendingGroupDetail, computeSpendingGroups } from '../../../engine'
import { downloadCsv, monthlySummaryCsv } from '../../../data/exportCsv'
import { basisOptions, computeCategoryActuals, fullMonthLabel } from '../../../engine'
import type { ExpenseModel } from '../../useExpenseData'
import type { TransactionsEntry } from '../../tabs/transactionsEntry'
import { Card, EmptyState } from '../../components/primitives'
import { Modal } from '../../components/Modal'
import { PresenceValue } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { useIsMobile } from '../../hooks/useIsMobile'
import { MonthlySummaryGrid } from '../MonthlySummaryGrid'
import { GroupByControl } from './GroupByControl'
import { MODE_OPTIONS, type SpendingMode } from './spendingMode'
import { presetFor } from './presetFor'
import { SpendingRow } from './SpendingRow'
import { SpendingDetailBody } from './SpendingDetailBody'
import { SegmentedControl } from '../../components/SegmentedControl'
import styles from './spending.module.css'

function Detail({
  model,
  months,
  month,
  basis,
  groupBy,
  row,
  onOpenTransactions,
}: {
  model: ExpenseModel
  months: string[]
  month: string
  basis: AnalyticsBasis
  groupBy: SpendingGroupBy
  row: SpendingGroupRow
  onOpenTransactions?: ((preset: TransactionsEntry) => void) | undefined
}) {
  const detail = useMemo(
    () =>
      computeSpendingGroupDetail(
        { transactions: model.dataset.transactions, categories: model.dataset.categories },
        { months, month, basis, groupBy, key: row.key },
      ),
    [model.dataset, months, month, basis, groupBy, row.key],
  )
  const preset = presetFor(groupBy, row, month)
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
  onOpenTransactions?: ((preset: TransactionsEntry) => void) | undefined
}

/** Where does the money go? Ranked rows with drill-down, or the exact grid with export. */
export function SpendingView({ model, month, basis, onOpenTransactions }: Props) {
  const isMobile = useIsMobile()
  const [groupBy, setGroupBy] = useState<SpendingGroupBy>('category')
  const [mode, setMode] = useState<SpendingMode>('list')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const rows = useMemo(
    () =>
      computeSpendingGroups(
        {
          transactions: model.dataset.transactions,
          categories: model.dataset.categories,
          labels: model.dataset.labels,
        },
        { months: model.months, month, basis, today: new Date().toISOString().slice(0, 10), groupBy },
      ),
    [model.dataset, model.months, month, basis, groupBy],
  )
  const selected = rows.find((r) => r.key === selectedKey) ?? null
  const changeGroupBy = (next: SpendingGroupBy) => {
    setGroupBy(next)
    setSelectedKey(null)
  }
  const exportGrid = () => {
    const gridRows = computeCategoryActuals(model.dataset.transactions, model.dataset.categories, {
      ...basisOptions(basis),
      ytdThroughMonth: month,
    })
    downloadCsv(`monthly-summary-${month}.csv`, monthlySummaryCsv(gridRows, model.months))
  }

  return (
    <div className={styles.stack}>
      <div className={styles.controls}>
        <GroupByControl value={groupBy} onChange={changeGroupBy} hasLabels={model.dataset.labels.length > 0} />
        <span className={styles.controlsSpacer} />
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} ariaLabel="Spending mode" />
        {mode === 'grid' && (
          <button type="button" className={styles.exportBtn} onClick={exportGrid}>
            Export CSV
          </button>
        )}
      </div>

      {mode === 'grid' ? (
        <MonthlySummaryGrid model={model} month={month} basis={basis} />
      ) : (
        <div className={isMobile || !selected ? undefined : styles.split}>
          <Card className={styles.listCard}>
            <p className={styles.listHint}>{fullMonthLabel(month)} — tap a row for its story.</p>
            {rows.length === 0 ? (
              <EmptyState>No spending recorded for this month and grouping.</EmptyState>
            ) : (
              rows.map((row) => (
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
                onOpenTransactions={onOpenTransactions}
              />
            </Modal>
          )}
        </PresenceValue>
      )}
    </div>
  )
}
