import type { Transaction } from '../../types'
import {
  claimReference,
  packReceipts,
  type PackLine,
  type ReimbursementPack,
} from '../../domain/engine/reimbursementPack'
import { formatCents, type MoneyFormat } from '../../engine/money'
import { formatDayLabel, type Lookup } from '../format'
import styles from './ReimbursementPackView.module.css'

interface SheetProps {
  pack: ReimbursementPack
  lookup: Lookup
  format: MoneyFormat
  claimantName: string
  currencyCode: string
  /** Today, as the issue date. Injected so the printed date is testable. */
  issuedOn: string
  /** Opens a line's editor, so a missing receipt can be attached from here. */
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}

/** The document itself: everything that appears on paper, and nothing else. */
export function ClaimSheet({
  pack,
  lookup,
  format,
  claimantName,
  currencyCode,
  issuedOn,
  onOpenTransaction,
}: SheetProps) {
  const receipts = packReceipts(pack)

  return (
    <article className={styles.sheet}>
      <ClaimHeader
        pack={pack}
        claimantName={claimantName}
        currencyCode={currencyCode}
        issuedOn={issuedOn}
      />
      <ClaimTable pack={pack} lookup={lookup} format={format} />
      <MissingReceipts pack={pack} lookup={lookup} onOpenTransaction={onOpenTransaction} />

      {receipts.length > 0 ? (
        <section className={styles.receipts}>
          <h2 className={styles.receiptsTitle}>Receipts</h2>
          {receipts.map(({ attachment, transaction, ref }) => (
            <figure key={attachment.id} className={styles.figure}>
              {attachment.contentType === 'application/pdf' ? (
                <p className={styles.pdfNote}>
                  PDF receipt — attach <strong>{attachment.originalName ?? 'the file'}</strong>{' '}
                  separately; a PDF cannot be printed into this page.
                </p>
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

function ClaimHeader({
  pack,
  claimantName,
  currencyCode,
  issuedOn,
}: {
  pack: ReimbursementPack
  claimantName: string
  currencyCode: string
  issuedOn: string
}) {
  return (
    <header className={styles.header}>
      <div className={styles.headerMain}>
        <p className={styles.docType}>Expense claim</p>
        <h1 className={styles.title}>{pack.flag.name}</h1>
        {pack.flag.description ? <p className={styles.subtitle}>{pack.flag.description}</p> : null}
      </div>
      <dl className={styles.meta}>
        {claimantName ? (
          <div className={styles.metaRow}>
            <dt>Claimant</dt>
            <dd>{claimantName}</dd>
          </div>
        ) : null}
        <div className={styles.metaRow}>
          <dt>Reference</dt>
          <dd>{claimReference(pack)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Period</dt>
          <dd>
            {formatDayLabel(pack.from)} – {formatDayLabel(pack.to)}
          </dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Issued</dt>
          <dd>{formatDayLabel(issuedOn)}</dd>
        </div>
        <div className={styles.metaRow}>
          <dt>Items</dt>
          <dd>
            {pack.lines.length} · {currencyCode}
          </dd>
        </div>
      </dl>
    </header>
  )
}

function ClaimRow({
  line,
  lookup,
  format,
  signed = false,
}: {
  line: PackLine
  lookup: Lookup
  format: MoneyFormat
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
        {transaction.notes ? <span className={styles.purpose}>{transaction.notes}</span> : null}
      </td>
      <td>{lookup.categoryName(transaction.categoryId)}</td>
      <td className={styles.numeric}>
        {formatCents(signed ? -transaction.amountCents : transaction.amountCents, format)}
      </td>
      <td className={styles.numeric}>
        {line.receiptRefs.length > 0 ? line.receiptRefs.map((r) => `R${r}`).join(' ') : '—'}
      </td>
    </tr>
  )
}

function ClaimTable({
  pack,
  lookup,
  format,
}: {
  pack: ReimbursementPack
  lookup: Lookup
  format: MoneyFormat
}) {
  const settled = pack.credits.length > 0
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Description</th>
            <th scope="col">Category</th>
            <th scope="col" className={styles.numeric}>
              Amount
            </th>
            <th scope="col" className={styles.numeric}>
              Receipt
            </th>
          </tr>
        </thead>
        <tbody>
          {pack.lines.map((line) => (
            <ClaimRow key={line.transaction.id} line={line} lookup={lookup} format={format} />
          ))}
        </tbody>
        {settled ? (
          <tbody className={styles.creditsBody}>
            <tr>
              <th scope="row" colSpan={5} className={styles.sectionRow}>
                Already reimbursed
              </th>
            </tr>
            {pack.credits.map((line) => (
              <ClaimRow
                key={line.transaction.id}
                line={line}
                lookup={lookup}
                format={format}
                signed
              />
            ))}
          </tbody>
        ) : null}
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>
              Total claimed
            </th>
            <td className={`${styles.numeric} ${settled ? '' : styles.total}`}>
              {formatCents(pack.totalClaimedCents, format)}
            </td>
            <td />
          </tr>
          {settled ? (
            <>
              <tr>
                <th scope="row" colSpan={3}>
                  Less reimbursed
                </th>
                <td className={styles.numeric}>{formatCents(-pack.creditedCents, format)}</td>
                <td />
              </tr>
              <tr>
                <th scope="row" colSpan={3}>
                  Outstanding
                </th>
                <td className={`${styles.numeric} ${styles.total}`}>
                  {formatCents(pack.outstandingCents, format)}
                </td>
                <td />
              </tr>
            </>
          ) : null}
        </tfoot>
      </table>
    </div>
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
  pack,
  lookup,
  onOpenTransaction,
}: {
  pack: ReimbursementPack
  lookup: Lookup
  onOpenTransaction?: ((txn: Transaction) => void) | undefined
}) {
  const bare = pack.lines.filter((line) => line.receipts.length === 0)
  if (bare.length === 0) return null

  return (
    <div className={styles.warning}>
      <p className={styles.warningText}>
        {bare.length} item{bare.length === 1 ? ' has' : 's have'} no receipt attached. Most
        employers will send the claim back for those.
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
