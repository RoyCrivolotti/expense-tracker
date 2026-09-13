import type { Transaction } from '../../types'
import { listPastReports } from '../../domain/engine/pastReports'
import { formatCents } from '../../engine/money'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import { EmptyState } from '../components/primitives'
import { Modal } from '../components/Modal'
import { FlagGlyph } from '../components/FlagGlyph'
import { formatDayLabel } from '../format'
import styles from './PastReportsModal.module.css'

interface Props {
  model: ExpenseModel
  onClose: () => void
  /** Reopen the report a payment settled, as it was when you sent it. */
  onOpenReport: (paymentId: number) => void
  onOpenPayment: (payment: Transaction) => void
}

/**
 * Everything you have already been paid for.
 *
 * The Flagged card only ever shows what is still owed, which is what makes it
 * useful — but it also means a finished report disappears from the app the
 * moment it is settled. This is where it goes, and the only way to answer
 * "send me the June one again" months later.
 */
export function PastReportsModal({ model, onClose, onOpenReport, onOpenPayment }: Props) {
  const format = useMoneyFormat()
  const reports = listPastReports(model.dataset.transactions, model.dataset.flags)

  return (
    <Modal
      title="Past expense reports"
      subtitle="Reports you have already been reimbursed for."
      onClose={onClose}
    >
      {reports.length === 0 ? (
        <EmptyState>
          Nothing yet. A report lands here once you record the reimbursement for it.
        </EmptyState>
      ) : (
        <ul className={styles.list}>
          {reports.map((report) => (
            <li key={report.payment.id} className={styles.row}>
              <div className={styles.body}>
                <span className={styles.name}>
                  {report.flag ? (
                    <FlagGlyph flag={report.flag} className={styles.glyph} decorative />
                  ) : null}
                  {/* The payment's own description: whatever you named it when
                      you recorded it. */}
                  {report.payment.description || 'Reimbursement'}
                </span>
                <span className={styles.meta}>
                  {formatDayLabel(report.payment.date)} · {report.count} transaction
                  {report.count === 1 ? '' : 's'} · {formatCents(report.coveredCents, format)}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => onOpenReport(report.payment.id)}
                >
                  Report
                </button>
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => onOpenPayment(report.payment)}
                >
                  Payment
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
