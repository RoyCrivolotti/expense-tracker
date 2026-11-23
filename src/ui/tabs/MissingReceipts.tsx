import type { Transaction } from '../../types'
import type { ExpenseReport } from '../../domain/engine/expenseReport'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ExpenseReportView.module.css'

/**
 * The lines an approver will send back.
 *
 * Actionable rather than a bare count: each one opens its editor so the receipt
 * can be attached without leaving to hunt for the row. This is also the answer
 * for rows entered through bulk-add, which has no per-row receipt affordance.
 */
export function MissingReceipts({
  report,
  lookup,
  onOpenTransaction,
}: {
  report: ExpenseReport
  lookup: Lookup
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}) {
  const bare = report.missingReceipts
  if (bare.length === 0) return null

  return (
    <div className={styles.warning}>
      <p className={styles.warningText}>
        {bare.length} item{bare.length === 1 ? ' has' : 's have'} no receipt attached. Most employers will send the
        report back for those.
      </p>
      {onOpenTransaction ? (
        <ul className={styles.warningList}>
          {bare.map(({ transaction }) => (
            <li key={transaction.id}>
              <button type="button" className={styles.warningBtn} onClick={() => onOpenTransaction(transaction)}>
                {formatDayLabel(transaction.date)} ·{' '}
                {transaction.description || lookup.categoryName(transaction.categoryId)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
