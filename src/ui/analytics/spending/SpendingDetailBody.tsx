import type { SpendingGroupDetail } from '../../../engine'
import { formatCents, formatCentsCompact, shortMonthLabel } from '../../../engine'
import type { ExpenseModel } from '../../useExpenseData'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import styles from './spending.module.css'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  )
}

function HistoryBars({ detail }: { detail: SpendingGroupDetail }) {
  const format = useMoneyFormat()
  const max = Math.max(1, ...detail.history.map((h) => Math.max(h.actualCents, h.budgetCents ?? 0)))
  return (
    <div className={styles.history}>
      {detail.history.map((h) => (
        <div key={h.month} className={styles.historyRow}>
          <span className={styles.historyMonth}>{shortMonthLabel(h.month)}</span>
          <span className={styles.historyTrack}>
            <i
              className={
                h.budgetCents !== null && h.actualCents > h.budgetCents
                  ? styles.historyOver
                  : styles.historyBar
              }
              style={{ width: `${(Math.max(0, h.actualCents) / max) * 100}%` }}
            />
            {h.budgetCents !== null && (
              <i className={styles.historyBudget} style={{ left: `${(h.budgetCents / max) * 100}%` }} />
            )}
          </span>
          <span className={styles.historyAmount}>{formatCentsCompact(h.actualCents, format)}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  detail: SpendingGroupDetail
  model: ExpenseModel
  /** Opens Transactions filtered to this row, when the grouping supports it. */
  onOpenTransactions?: (() => void) | undefined
}

/** A row's story: stats, monthly history against the budget, and the biggest transactions. */
export function SpendingDetailBody({ detail, model, onOpenTransactions }: Props) {
  const format = useMoneyFormat()
  return (
    <div className={styles.detailBody}>
      <div className={styles.stats}>
        <Stat label="Typical month" value={formatCentsCompact(detail.medianCents, format)} />
        <Stat label="Average" value={formatCentsCompact(detail.meanCents, format)} />
        {detail.worst && (
          <Stat
            label={`Worst (${shortMonthLabel(detail.worst.month)})`}
            value={formatCentsCompact(detail.worst.cents, format)}
          />
        )}
      </div>
      {detail.monthsOver > 0 && (
        <p className={styles.detailNote}>
          Over budget in {detail.monthsOver} of the last {detail.history.length} months — against
          today&apos;s budget.
        </p>
      )}
      <HistoryBars detail={detail} />
      {detail.topTransactions.length > 0 && (
        <div className={styles.topList}>
          <h4 className={styles.topTitle}>Biggest this month</h4>
          {detail.topTransactions.map((t) => (
            <div key={t.id} className={styles.topRow}>
              <span className={styles.topDate}>{t.date.slice(8)}.{t.date.slice(5, 7)}</span>
              <span className={styles.topDesc}>{t.description || model.lookup.categoryName(t.categoryId)}</span>
              <span className={styles.topAmount}>{formatCents(t.amountCents, format)}</span>
            </div>
          ))}
        </div>
      )}
      {onOpenTransactions && (
        <button type="button" className={styles.openTxns} onClick={onOpenTransactions}>
          Open in Transactions
        </button>
      )}
    </div>
  )
}
