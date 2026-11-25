import { useState } from 'react'
import { reportReceipts, type ExpenseReport } from '../../domain/engine/expenseReport'
import { deliverReceipts } from '../../data/receiptDownload'
import { namedReceipts, receiptPackName } from '../../domain/engine/receiptFiles'
import type { Lookup } from '../format'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import styles from './ExpenseReportView.module.css'

/**
 * Send the claim's receipts on their own, without the report around them.
 *
 * Its own component so the view keeps its branch count, and so the busy and
 * error states sit next to the button they belong to. Disabled rather than
 * hidden when a report has no receipts: the button going missing between two
 * reports reads as a bug, where a disabled one with a reason does not.
 */
export function ReceiptsButton({ report, lookup, title }: { report: ExpenseReport; lookup: Lookup; title: string }) {
  const format = useMoneyFormat()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const figures = reportReceipts(report)
  const send = async () => {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      await deliverReceipts(
        namedReceipts(
          figures,
          format,
          (f) => f.transaction.description || lookup.categoryName(f.transaction.categoryId),
        ),
        receiptPackName(title, report.from),
      )
    } catch (e) {
      // AbortError is the user dismissing the share sheet, which is not a
      // failure and must not be reported as one.
      if (!(e instanceof Error) || e.name !== 'AbortError') {
        setErr(e instanceof Error ? e.message : 'Could not send the receipts')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.secondaryBtn}
        disabled={busy || figures.length === 0}
        aria-label={figures.length === 0 ? 'No receipts attached to this report' : 'Send receipts'}
        title={figures.length === 0 ? 'No receipts attached to this report' : undefined}
        onClick={() => void send()}
      >
        {/* No long/short split: "Receipts" fits beside CSV and Print even at
            390px, and "Rec." reads as nothing in particular. */}
        {busy ? 'Preparing…' : 'Receipts'}
      </button>
      {err ? (
        <p className={styles.toolbarError} role="alert">
          {err}
        </p>
      ) : null}
    </>
  )
}
