import { REVIEW_TEXT, type ReviewReason } from '../../domain/capture/review'
import { Money } from '../components/Money'
import type { ReviewApi } from './useReviewApi'
import type { ReviewView } from './reviewFields'
import { foreignAmount, monthWord, typeWord, weekdayDay } from './reviewFormat'
import styles from './Review.module.css'

const IN_FIELDS: ReadonlySet<ReviewReason> = new Set(['no-category', 'no-account', 'no-merchant'])

function Amount({ view }: { view: ReviewView }) {
  if (view.amountCents === null) return null
  if (view.reasons.includes('foreign')) return <span className={styles.amount}>{foreignAmount(view)}</span>
  return <Money cents={view.amountCents} type={view.type ?? undefined} className={styles.amount} />
}

/** A long description is cut for the button, so it does not push the button off the row; the full text is its name and title. */
function shortened(text: string): string {
  return text.length > MAX_SHOWN ? `${text.slice(0, MAX_SHOWN - 1).trimEnd()}\u2026` : text
}

const MAX_SHOWN = 36

function Missing({ text }: { text: string }) {
  return <span className={styles.missing}>{text}</span>
}

/** The seven fields a payment would become: type, amount, description, category, account, date and budget month. */
function Fields({ view }: { view: ReviewView }) {
  return (
    <>
      <div className={styles.top}>
        <span className={styles.name}>{view.description || <Missing text="No merchant" />}</span>
        <Amount view={view} />
      </div>
      <div className={styles.meta}>
        <span>{typeWord(view.type)}</span>
        <span aria-hidden="true">·</span>
        {view.categoryName ? <span>{view.categoryName}</span> : <Missing text="Category: not set" />}
        <span aria-hidden="true">·</span>
        {view.accountName ? <span>{view.accountName}</span> : <Missing text="Account: not set" />}
      </div>
      <div className={styles.meta}>
        <span>{[weekdayDay(view.date), view.time].filter(Boolean).join(', ')}</span>
        <span aria-hidden="true">·</span>
        <span>{monthWord(view.budgetMonth)} budget</span>
      </div>
    </>
  )
}

function Buttons({ view, review, onReview }: { view: ReviewView; review: ReviewApi; onReview: (view: ReviewView) => void }) {
  const match = view.rec.possibleMatch
  const label = view.description || 'payment'
  return (
    <div className={styles.actions}>
      {view.oneTap ? (
        <button type="button" className={`${styles.pill} ${styles.primary}`} aria-label={`Add ${label}`} onClick={() => review.add(view)}>
          Add
        </button>
      ) : null}
      <button type="button" className={`${styles.pill} ${view.oneTap ? '' : styles.primary}`} onClick={() => onReview(view)}>
        {view.oneTap ? 'Change' : 'Review'}
      </button>
      {match ? (
        <button type="button" className={styles.link} aria-label={`Already entered as ${match.description}? Link`} title={match.description} onClick={() => review.link(view)}>
          Already entered as {shortened(match.description)}? Link
        </button>
      ) : null}
      <button type="button" className={`${styles.pill} ${styles.quiet}`} aria-label={`Don't add ${label}`} onClick={() => review.dontAdd(view)}>
        Don&apos;t add
      </button>
    </div>
  )
}

/** One payment to review. Without write access (an offline copy) it is shown and nothing can be pressed. */
export function ReviewRow({ view, review, onReview }: { view: ReviewView; review: ReviewApi; onReview: (view: ReviewView) => void }) {
  const failure = review.failures.get(view.rec.id)
  // A missing category, account or merchant is already marked in the fields themselves.
  const chips = view.reasons.filter((r) => !IN_FIELDS.has(r))
  return (
    <li className={styles.row}>
      <Fields view={view} />
      {chips.length ? (
        <div className={styles.chips}>
          {chips.map((r) => (
            <span key={r} className={styles.chip}>
              {REVIEW_TEXT[r]}
            </span>
          ))}
        </div>
      ) : null}
      {failure ? (
        <p role="alert" className={styles.error}>
          Not sent: {failure}
        </p>
      ) : null}
      {review.canWrite ? <Buttons view={view} review={review} onReview={onReview} /> : null}
    </li>
  )
}
