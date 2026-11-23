import type { Transaction } from '../../types'
import type { ExpenseReport } from '../../domain/engine/expenseReport'
import type { MoneyFormat } from '../../engine/money'
import type { Lookup } from '../format'
import { MissingReceipts } from './MissingReceipts'
import { ReportHeader } from './ReportHeader'
import { ReportReceipts } from './ReportReceipts'
import { ReportTable } from './ReportTable'
import styles from './ExpenseReportView.module.css'

interface SheetProps {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
  claimantName: string
  currencyCode: string
  /** Today, as the issue date. Injected so the printed date is testable. */
  issuedOn: string
  /** What the claim is called on the document. Defaults to the flag's own name. */
  title: string
  onTitleChange: (title: string) => void
  /** What the claim is for, in the claimant's words. Blank prints nothing. */
  purpose: string
  onPurposeChange: (purpose: string) => void
  /** Whether each line's own notes print under its description. */
  showNotes: boolean
  /** Opens a line's editor, so a missing receipt can be attached from here. */
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}

/** The document itself: everything that appears on paper, and nothing else. */
export function ExpenseReportSheet({
  report,
  lookup,
  format,
  claimantName,
  currencyCode,
  issuedOn,
  title,
  onTitleChange,
  purpose,
  onPurposeChange,
  showNotes,
  onOpenTransaction,
}: SheetProps) {
  return (
    <article className={styles.sheet}>
      <ReportHeader
        report={report}
        claimantName={claimantName}
        currencyCode={currencyCode}
        issuedOn={issuedOn}
        format={format}
        title={title}
        onTitleChange={onTitleChange}
        purpose={purpose}
        onPurposeChange={onPurposeChange}
      />
      <ReportTable report={report} lookup={lookup} format={format} showNotes={showNotes} />
      <MissingReceipts report={report} lookup={lookup} onOpenTransaction={onOpenTransaction} />

      <ReportReceipts report={report} lookup={lookup} format={format} />

      {/* Print-only: a claim usually has to be signed before it is submitted. */}
      <section className={styles.signature}>
        <div className={styles.signatureLine} />
        <p className={styles.signatureLabel}>Signature{claimantName ? ` — ${claimantName}` : ''}</p>
      </section>
    </article>
  )
}
