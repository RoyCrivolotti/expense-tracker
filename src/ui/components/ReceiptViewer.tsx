import type { TransactionAttachment } from '../../types'
import { Modal } from './Modal'
import styles from './ReceiptStrip.module.css'

/**
 * Full-size view of one receipt.
 *
 * A PDF is offered as a link rather than embedded: the serve route sends PDFs
 * with `Content-Disposition: attachment` precisely so they cannot render inline
 * on our origin, and an <iframe> that silently downloads instead is worse than
 * a link that says so.
 */
export function ReceiptViewer({
  attachment,
  onClose,
}: {
  attachment: TransactionAttachment
  onClose: () => void
}) {
  const href = `/api/expenses/attachments/${attachment.id}`
  const isPdf = attachment.contentType === 'application/pdf'
  return (
    <Modal title={attachment.originalName ?? 'Receipt'} onClose={onClose}>
      {isPdf ? (
        <p className={styles.pdfNote}>
          <a href={href} className={styles.pdfLink}>
            Open the PDF
          </a>
          <span className={styles.pdfHint}>
            PDFs download rather than opening here, so a document cannot run scripts in the app.
          </span>
        </p>
      ) : (
        <img src={href} alt={attachment.originalName ?? 'Receipt'} className={styles.full} />
      )}
    </Modal>
  )
}
