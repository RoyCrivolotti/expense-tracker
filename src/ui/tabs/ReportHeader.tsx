import type { ExpenseReport } from '../../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel } from '../format'
import { EditablePurpose, EditableTitle } from './ReportInlineEdit'
import styles from './ExpenseReportView.module.css'

export function ReportHeader({
  report,
  claimantName,
  currencyCode,
  issuedOn,
  format,
  title,
  onTitleChange,
  purpose,
  onPurposeChange,
}: {
  report: ExpenseReport
  claimantName: string
  currencyCode: string
  issuedOn: string
  format: MoneyFormat
  title: string
  onTitleChange: (title: string) => void
  purpose: string
  onPurposeChange: (purpose: string) => void
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.docType}>Expense report</p>
        <EditableTitle title={title} onTitleChange={onTitleChange} />
        <EditablePurpose purpose={purpose} onPurposeChange={onPurposeChange} />
      </div>
      <ReportMeta
        report={report}
        claimantName={claimantName}
        currencyCode={currencyCode}
        issuedOn={issuedOn}
        format={format}
      />
    </header>
  )
}

function ReportMeta({
  report,
  claimantName,
  currencyCode,
  issuedOn,
  format,
}: {
  report: ExpenseReport
  claimantName: string
  currencyCode: string
  issuedOn: string
  format: MoneyFormat
}) {
  const settled = report.credits.length > 0
  return (
    <dl className={styles.meta}>
      {claimantName ? (
        <div className={styles.metaRow}>
          <dt>Submitted by</dt>
          <dd>{claimantName}</dd>
        </div>
      ) : null}
      <div className={styles.metaRow}>
        <dt>Period</dt>
        <dd>
          {formatDayLabel(report.from)} – {formatDayLabel(report.to)}
        </dd>
      </div>
      <div className={styles.metaRow}>
        <dt>Issued</dt>
        <dd>{formatDayLabel(issuedOn)}</dd>
      </div>
      <div className={styles.metaRow}>
        <dt>Items</dt>
        <dd>{report.lines.length}</dd>
      </div>
      <div className={styles.metaRow}>
        <dt>Currency</dt>
        <dd>{currencyCode}</dd>
      </div>
      {/* The figure an approver is looking for, where they look first. */}
      <div className={styles.metaRow}>
        <dt>Total</dt>
        <dd>{formatCents(report.totalClaimedCents, format)}</dd>
      </div>
      {settled ? (
        <div className={styles.metaRow}>
          <dt>Outstanding</dt>
          <dd>{formatCents(report.outstandingCents, format)}</dd>
        </div>
      ) : null}
    </dl>
  )
}
