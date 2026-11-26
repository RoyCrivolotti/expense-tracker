import { useEffect, useRef, useState } from 'react'
import { linkRecommendation } from '../../data/recommendationDecisionsApi'
import type { TxnType } from '../../types'
import type { DuplicateOffer } from '../actions'
import { Money } from '../components/Money'
import { formatDayLabel } from '../format'
import styles from './Review.module.css'

const TYPES: ReadonlySet<string> = new Set<TxnType>(['expense', 'income', 'investment', 'refund'])

/** The entry's day, amount and account, each only when it is known, so an older answer still shows what it has. */
function EntryMeta({ offer, accountName }: { offer: DuplicateOffer; accountName: string | null }) {
  const { date, amountCents, type } = offer.match
  return (
    <span className={styles.entryMeta}>
      {formatDayLabel(date)}
      {amountCents === undefined ? null : (
        <>
          {' · '}
          <Money
            cents={amountCents}
            type={type !== undefined && TYPES.has(type) ? (type as TxnType) : undefined}
            className={styles.entryAmount}
          />
        </>
      )}
      {accountName ? ` · ${accountName}` : null}
    </span>
  )
}

/**
 * Shown above the review view's fields when an entry the person already has looks like the payment: the entry in full,
 * and Link instead, which points the payment at it and creates nothing. The form's own button adds it all the same:
 * it reads Add for a match the list already showed, and Add anyway once the server has refused a save for an entry it
 * found only then. That block arrives above fields the person may have scrolled past, so it is brought into view. It
 * is not an error, so it is a note and not the form's error line.
 */
export default function DuplicateNotice({ offer, accountName }: { offer: DuplicateOffer; accountName: string | null }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { match } = offer
  const block = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (offer.refused) block.current?.scrollIntoView?.({ block: 'nearest' })
  }, [offer.refused])
  const link = () => {
    setBusy(true)
    setProblem(null)
    linkRecommendation(offer.recommendationId, match.transactionId).then(
      () => offer.onLinked(),
      (e: unknown) => {
        setProblem(e instanceof Error ? e.message : 'Could not link it')
        setBusy(false)
      },
    )
  }
  return (
    <div ref={block} className={styles.duplicate} role="alert">
      <p className={styles.duplicateText}>
        <b>Possible duplicate.</b> You already have this entry:
      </p>
      <div className={styles.entry}>
        <span className={styles.entryName}>{match.description}</span>
        <EntryMeta offer={offer} accountName={accountName} />
      </div>
      <div className={styles.duplicateActions}>
        <span>If it is the same payment:</span>
        <button type="button" className={styles.duplicateLink} disabled={busy} onClick={link}>
          Link instead
        </button>
      </div>
      {problem ? <p className={styles.error}>{problem}</p> : null}
    </div>
  )
}
