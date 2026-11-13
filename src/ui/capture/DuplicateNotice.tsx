import { useState } from 'react'
import { linkRecommendation } from '../../data/recommendationDecisionsApi'
import type { DuplicateOffer } from '../actions'
import styles from './Review.module.css'

/**
 * Shown in the add form when the server found a typed row that looks like the payment: the row it found, a Link that
 * points the payment at it and creates nothing, and Add anyway, which submits the form again and goes ahead. It is
 * not an error, so it is a note and not the form's error line.
 */
export default function DuplicateNotice({ offer }: { offer: DuplicateOffer }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { match } = offer
  return (
    <div className={styles.duplicate} role="note">
      <p className={styles.duplicateText}>
        Already entered as <strong>{match.description}</strong> on {match.date}?
      </p>
      <div className={styles.duplicateActions}>
        <button
          type="button"
          className={styles.duplicateLink}
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setProblem(null)
            linkRecommendation(offer.recommendationId, match.transactionId).then(
              () => offer.onLinked(),
              (e: unknown) => {
                setProblem(e instanceof Error ? e.message : 'Could not link it')
                setBusy(false)
              },
            )
          }}
        >
          Link
        </button>
        <button type="submit" className={styles.duplicateAnyway} disabled={busy} onClick={offer.addAnyway}>
          Add anyway
        </button>
      </div>
      {problem ? (
        <p role="alert" className={styles.error}>
          {problem} You can still add this payment.
        </p>
      ) : null}
    </div>
  )
}
