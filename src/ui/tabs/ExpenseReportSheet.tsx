import { useRef, useState, type ReactNode } from 'react'
import type { Transaction } from '../../types'
import {
  reportReceipts,
  type ReportLine,
  type ExpenseReport,
} from '../../domain/engine/expenseReport'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
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
  const receipts = reportReceipts(report)

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

      {receipts.length > 0 ? (
        <section className={styles.receipts}>
          <h2 className={styles.receiptsTitle}>Receipts</h2>
          {receipts.map(({ attachment, transaction, ref }) => (
            <figure key={attachment.id} className={styles.figure}>
              {attachment.contentType === 'application/pdf' ? (
                <div className={styles.pdfNote}>
                  <p className={styles.pdfNoteText}>
                    <strong>R{ref}</strong> is a PDF, sent as a separate attachment
                    {attachment.originalName ? (
                      <>
                        {' '}
                        (<strong>{attachment.originalName}</strong>)
                      </>
                    ) : null}
                    .{' '}
                    {/* Addressed to the claimant, so it stays off paper: the reader
                        of the printed page only needs to know a file travels with it.
                        Rendering a PDF here would mean shipping a PDF engine: pdf.js
                        is ~505 KB gzip against a 162 KB app, and it is the only
                        honest option — turning a PDF into pixels *is* the heavy
                        part. A screenshot costs nothing and already works, because
                        receipts accept image/png. */}
                    <span className={styles.screenOnly}>
                      To have it print on this page instead, attach a screenshot of it as an
                      image.
                    </span>
                  </p>
                  {/* Screen only: on paper a link is a dead underline, and the
                      filename in the sentence is what the reader actually needs. */}
                  <a
                    className={styles.pdfLink}
                    href={`/api/expenses/attachments/${attachment.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open R{ref}
                  </a>
                </div>
              ) : (
                <img
                  src={`/api/expenses/attachments/${attachment.id}`}
                  alt={`Receipt for ${transaction.description}`}
                  className={styles.receiptImage}
                />
              )}
              <figcaption className={styles.caption}>
                <span className={styles.refBadge}>R{ref}</span>{' '}
                {formatDayLabel(transaction.date)} ·{' '}
                {transaction.description || lookup.categoryName(transaction.categoryId)} ·{' '}
                {formatCents(transaction.amountCents, format)}
              </figcaption>
            </figure>
          ))}
        </section>
      ) : null}

      {/* Print-only: a claim usually has to be signed before it is submitted. */}
      <section className={styles.signature}>
        <div className={styles.signatureLine} />
        <p className={styles.signatureLabel}>
          Signature{claimantName ? ` — ${claimantName}` : ''}
        </p>
      </section>
    </article>
  )
}

/**
 * A piece of text that is edited in place and lives only for this visit.
 *
 * Nothing about a report is stored: it rebuilds itself fresh every time it is
 * opened, so there is nowhere to keep an edit between visits without inventing
 * storage for a document that has none. Enter or blur commits, Escape cancels.
 * `display` draws the resting state and is handed the function that starts an edit.
 */
function InlineEdit({
  value,
  ariaLabel,
  inputClassName,
  allowEmpty = false,
  placeholder,
  onCommit,
  display,
}: {
  value: string
  ariaLabel: string
  inputClassName: string | undefined
  /** Whether clearing the field is a real edit. A title cannot be blank; a purpose can. */
  allowEmpty?: boolean
  placeholder?: string
  onCommit: (value: string) => void
  display: (startEditing: () => void) => ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = () => {
    const next = inputRef.current?.value.trim() ?? ''
    if (next || allowEmpty) onCommit(next)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={inputClassName}
        defaultValue={value}
        placeholder={placeholder}
        autoFocus
        aria-label={ariaLabel}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          } else if (e.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return <>{display(() => setEditing(true))}</>
}

/**
 * The claim's name. An employer reading the document needs to know what it is
 * *for*, which is why this defaults to the flag's name and can be renamed.
 */
function EditableTitle({
  title,
  onTitleChange,
}: {
  title: string
  onTitleChange: (title: string) => void
}) {
  return (
    <InlineEdit
      value={title}
      ariaLabel="Report title"
      inputClassName={styles.titleInput}
      onCommit={onTitleChange}
      display={(startEditing) => (
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
            Rename
          </button>
        </div>
      )}
    />
  )
}

/**
 * One line saying what the claim covers, in the claimant's own words.
 *
 * Blank by default and then absent from the page, so nothing prints that the
 * claimant did not write. The flag's description used to fill this slot, but
 * that is a note the claimant keeps for themselves ("submit monthly"), not
 * something to put in front of an approver.
 */
function EditablePurpose({
  purpose,
  onPurposeChange,
}: {
  purpose: string
  onPurposeChange: (purpose: string) => void
}) {
  return (
    <InlineEdit
      value={purpose}
      ariaLabel="Report purpose"
      inputClassName={styles.purposeInput}
      placeholder="e.g. Client visit, Madrid"
      allowEmpty
      onCommit={onPurposeChange}
      display={(startEditing) =>
        purpose ? (
          <div className={styles.titleRow}>
            <p className={styles.subtitle}>{purpose}</p>
            <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
              Edit
            </button>
          </div>
        ) : (
          <button type="button" className={styles.titleEditBtn} onClick={startEditing}>
            Add a purpose
          </button>
        )
      }
    />
  )
}

function ReportHeader({
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
  const settled = report.credits.length > 0
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.docType}>Expense report</p>
        <EditableTitle title={title} onTitleChange={onTitleChange} />
        <EditablePurpose purpose={purpose} onPurposeChange={onPurposeChange} />
      </div>
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
    </header>
  )
}

function ReportRow({
  line,
  lookup,
  format,
  showNotes,
  signed = false,
}: {
  line: ReportLine
  lookup: Lookup
  format: MoneyFormat
  showNotes: boolean
  signed?: boolean
}) {
  const { transaction } = line
  return (
    <tr>
      <td>{formatDayLabel(transaction.date)}</td>
      <td>
        {transaction.description || lookup.categoryName(transaction.categoryId)}
        {/* The transaction's own notes. An approver asks what a dinner was for,
            and that is exactly what this field already holds. */}
        {showNotes && transaction.notes ? (
          <span className={styles.notes}>{transaction.notes}</span>
        ) : null}
      </td>
      <td className={styles.hideNarrow}>{lookup.categoryName(transaction.categoryId)}</td>
      <td className={styles.numeric}>
        {formatCents(signed ? -transaction.amountCents : transaction.amountCents, format)}
      </td>
      <td className={styles.numeric}>
        {line.receiptRefs.length > 0
          ? line.receiptRefs.map((r) => `R${r}`).join(' ')
          : signed
            ? '—'
            : 'No receipt'}
      </td>
    </tr>
  )
}

function ReportTable({
  report,
  lookup,
  format,
  showNotes,
}: {
  report: ExpenseReport
  lookup: Lookup
  format: MoneyFormat
  showNotes: boolean
}) {
  const settled = report.credits.length > 0
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col" className={styles.hideNarrow}>
              Category
            </th>
            <th scope="col" className={styles.numeric}>
              Amount
            </th>
            <th scope="col" className={styles.numeric}>
              Receipt
            </th>
          </tr>
        </thead>
        <tbody>
          {report.lines.map((line) => (
            <ReportRow
              key={line.transaction.id}
              line={line}
              lookup={lookup}
              format={format}
              showNotes={showNotes}
            />
          ))}
        </tbody>
        {settled ? (
          <tbody className={styles.creditsBody}>
            <tr>
              <th scope="row" colSpan={5} className={styles.sectionRow}>
                Already reimbursed
              </th>
            </tr>
            {report.credits.map((line) => (
              <ReportRow
                key={line.transaction.id}
                line={line}
                lookup={lookup}
                format={format}
                showNotes={showNotes}
                signed
              />
            ))}
          </tbody>
        ) : null}
        <tfoot>
          <TotalRow
            label="Total expenses"
            cents={report.totalClaimedCents}
            format={format}
            emphasis={!settled}
          />
          {settled ? (
            <>
              <TotalRow label="Less reimbursed" cents={-report.creditedCents} format={format} />
              <TotalRow
                label="Outstanding"
                cents={report.outstandingCents}
                format={format}
                emphasis
              />
            </>
          ) : null}
        </tfoot>
      </table>
    </div>
  )
}

/**
 * A totals row.
 *
 * The label spans only Date and Description, with a separate placeholder for
 * Category — a single `colSpan={3}` would keep claiming three columns after the
 * Category column is hidden on a narrow screen, pushing the figure one cell
 * right and out from under its own heading.
 */
function TotalRow({
  label,
  cents,
  format,
  emphasis,
}: {
  label: string
  cents: number
  format: MoneyFormat
  emphasis?: boolean
}) {
  return (
    <tr>
      <th scope="row" colSpan={2}>
        {label}
      </th>
      <td className={styles.hideNarrow} />
      <td className={`${styles.numeric} ${emphasis ? styles.total : ''}`}>
        {formatCents(cents, format)}
      </td>
      <td />
    </tr>
  )
}

/**
 * The lines an approver will send back.
 *
 * Actionable rather than a bare count: each one opens its editor so the receipt
 * can be attached without leaving to hunt for the row. This is also the answer
 * for rows entered through bulk-add, which has no per-row receipt affordance.
 */
function MissingReceipts({
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
        {bare.length} item{bare.length === 1 ? ' has' : 's have'} no receipt attached. Most
        employers will send the report back for those.
      </p>
      {onOpenTransaction ? (
        <ul className={styles.warningList}>
          {bare.map(({ transaction }) => (
            <li key={transaction.id}>
              <button
                type="button"
                className={styles.warningBtn}
                onClick={() => onOpenTransaction(transaction)}
              >
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
