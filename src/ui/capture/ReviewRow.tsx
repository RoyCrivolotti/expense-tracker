import { useId, useRef } from 'react'
import { paymentDirection } from '../../domain/capture/direction'
import type { SeriesFit } from '../../domain/capture/seriesMatch'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { PairTie } from './PairTie'
import type { ReviewApi } from './useReviewApi'
import type { ReviewView } from './reviewFields'
import { signedAmount } from './reviewFormat'
import { rowButton, rowNote, rowTitle, rowWhen, type RowNote, type RowPlace } from './reviewRowText'
import styles from './ReviewList.module.css'

/** Opens the add form on a payment, filled from `series` when the person picked one of the series its hint offers. */
export type OnReview = (
  view: ReviewView,
  series?: SeriesFit,
) => void

/** Where a row sits in a same-bill pair: the first of the two carries the heading. */
export type Tie = 'top' | 'bottom' | null

const TIE_CLASS = { top: styles.tieTop, bottom: styles.tieBottom } as const

function Amount({ view, text }: { view: ReviewView; text: string }) {
  if (view.amountCents === null) return <span className={styles.noAmount}>No amount</span>
  const direction = paymentDirection(view.type)
  return (
    <span className={`${styles.amount} ${direction === 'in' ? styles.in : ''}`}>
      {text}
      {direction ? <span className={styles.srOnly}>{direction === 'in' ? ' money in' : ' money out'}</span> : null}
    </span>
  )
}

function Note({ note, failure }: { note: RowNote; failure: string | undefined }) {
  if (note.tone === 'plain') return <>{note.text}</>
  if (note.tone === 'bad')
    return (
      <span role="alert" className={styles.bad}>
        {note.text}
        <span className={styles.srOnly}>: {failure}</span>
      </span>
    )
  return <span className={styles[note.tone]}>{note.text}</span>
}

/** The row's one button. On a Review row it does what the row does, so only the row is announced and reached by Tab. */
function Pill({ add, spoken, onPress }: { add: boolean; spoken: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className={styles.pill}
      {...(add ? { 'aria-label': `Add ${spoken}` } : { tabIndex: -1, 'aria-hidden': true })}
      onClick={onPress}
    >
      <span className={`${styles.face} ${add ? styles.add : styles.review}`}>{add ? 'Add' : 'Review'}</span>
    </button>
  )
}

interface RowProps {
  view: ReviewView
  place: RowPlace
  tie: Tie
  today: string
  review: ReviewApi
  onReview: OnReview
}

/**
 * One payment to review, on one line: the amount with its day, the name with one note, and one button. Tapping
 * anywhere else on the row opens the review view, which is where a payment is changed or not added. Without write
 * access (an offline copy) it is shown and nothing can be pressed.
 */
export function ReviewRow({ view, place, tie, today, review, onReview }: RowProps) {
  const format = useMoneyFormat()
  const failure = review.failures.get(view.rec.id)
  const title = rowTitle(view)
  const when = rowWhen(view, place, today)
  const amount = signedAmount(view, format)
  const spoken = `${title.long}, ${amount || 'no amount'}`
  const add = rowButton(view) === 'add'
  const note = useId()
  const tap = useRef<HTMLButtonElement>(null)
  // The Review pill is not a stop of its own, so a press on it is the row's press: the focus goes to the row's
  // button, which is where it comes back to when the form closes.
  const fromPill = () => {
    tap.current?.focus({ preventScroll: true })
    onReview(view)
  }
  return (
    <li className={`${styles.row} ${tie ? TIE_CLASS[tie] : ''}`}>
      {tie === 'top' ? (
        <PairTie amount={amount} onDismiss={review.canWrite ? () => review.dismissDuplicate(view) : undefined} />
      ) : null}
      <div className={`${styles.line} ${review.canWrite ? '' : styles.plain}`}>
        <div className={styles.lead}>
          <Amount view={view} text={amount} />
          <span className={styles.when}>{when}</span>
        </div>
        <div className={styles.mid}>
          <div className={`${styles.title} ${view.unnamed ? styles.unnamed : ''}`}>
            {review.canWrite ? (
              <button
                ref={tap}
                type="button"
                className={styles.tap}
                aria-label={`Review ${spoken}, ${when}`}
                data-review-id={view.rec.id}
                aria-describedby={note}
                onClick={() => onReview(view)}
              >
                <span className={styles.text}>{title.text}</span>
              </button>
            ) : (
              title.text
            )}
          </div>
          <p id={note} className={styles.meta}>
            <Note note={rowNote(view, place, today, failure !== undefined)} failure={failure} />
          </p>
        </div>
        {review.canWrite ? <Pill add={add} spoken={spoken} onPress={add ? () => review.add(view) : fromPill} /> : null}
      </div>
    </li>
  )
}

/** Rows in the order given, with the two of a same-bill pair tied when they sit one under the other. */
export function ReviewRows({ views, ...row }: Omit<RowProps, 'view' | 'tie'> & { views: readonly ReviewView[] }) {
  const tieOf = (i: number): Tie => {
    const other = row.review.pairs.get(views[i]!.rec.id)?.other.rec.id
    if (other === undefined) return null
    return views[i + 1]?.rec.id === other ? 'top' : views[i - 1]?.rec.id === other ? 'bottom' : null
  }
  return (
    <ul className={styles.rows}>
      {views.map((view, i) => (
        <ReviewRow key={view.rec.id} view={view} tie={tieOf(i)} {...row} />
      ))}
    </ul>
  )
}
