import { REVIEW_TEXT, type ReviewReason } from '../../domain/capture/review'
import type { SeriesFit } from '../../domain/capture/seriesMatch'
import { Money } from '../components/Money'
import type { ReviewApi } from './useReviewApi'
import type { ReviewView } from './reviewFields'
import { dueOn, foreignAmount, monthWord, typeWord, weekdayDay } from './reviewFormat'
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

/** Opens the add form on a payment, filled from `series` when the person picked one of the series its hint offers. */
export type OnReview = (
  view: ReviewView,
  series?: SeriesFit,
) => void

/**
 * What the monthly series say the payment may be, always as a question for the person. Two series are offered side by
 * side and neither is preferred: each opens review filled from that one.
 */
function SeriesLine({ view, review, onReview }: { view: ReviewView; review: ReviewApi; onReview: OnReview }) {
  const { hint, hintAccount } = view
  if (!hint) return null
  if (hint.kind === 'choose') {
    return (
      <div className={styles.series}>
        <p className={styles.seriesText}>Looks like one of your monthly payments. Which one?</p>
        <div className={styles.seriesChoices}>
          {hint.series.map((s) =>
            review.canWrite ? (
              <button
                key={s.seriesKey}
                type="button"
                className={styles.link}
                aria-label={`Review as ${s.description}, ${dueOn(s.usualDate)}`}
                onClick={() => onReview(view, s)}
              >
                {s.description}, {dueOn(s.usualDate)}
              </button>
            ) : (
              <span key={s.seriesKey}>
                {s.description}, {dueOn(s.usualDate)}
              </span>
            ),
          )}
        </div>
      </div>
    )
  }
  const name = <strong>{hint.series.description}</strong>
  const text =
    hint.kind === 'moved' ? (
      <>
        Looks like {name}, which you pay from {hintAccount ?? 'another account'}. Moved it?
      </>
    ) : (
      <>
        Looks like your monthly {name}, {dueOn(hint.series.usualDate)}
        {hintAccount ? `, paid from ${hintAccount}` : ''}.
        {hint.kind === 'renamed' ? (
          <>
            {' '}
            You added it as <strong>{hint.votedDescription}</strong> before. Renamed?
          </>
        ) : null}
      </>
    )
  return (
    <div className={styles.series}>
      <p className={styles.seriesText}>{text}</p>
    </div>
  )
}

function Buttons({
  view,
  review,
  onReview,
}: {
  view: ReviewView
  review: ReviewApi
  onReview: (view: ReviewView) => void
}) {
  const match = view.rec.possibleMatch
  const label = view.description || 'payment'
  return (
    <div className={styles.actions}>
      {view.oneTap ? (
        <button
          type="button"
          className={`${styles.pill} ${styles.primary}`}
          aria-label={`Add ${label}`}
          onClick={() => review.add(view)}
        >
          Add
        </button>
      ) : null}
      <button
        type="button"
        className={`${styles.pill} ${view.oneTap ? '' : styles.primary}`}
        onClick={() => onReview(view)}
      >
        {view.oneTap ? 'Change' : 'Review'}
      </button>
      {match ? (
        <button
          type="button"
          className={styles.link}
          aria-label={`Already entered as ${shortened(match.description)}? Link${shortened(match.description) === match.description ? '' : `, ${match.description}`}`}
          title={match.description}
          onClick={() => review.link(view)}
        >
          Already entered as {shortened(match.description)}? Link
        </button>
      ) : null}
      <button
        type="button"
        className={`${styles.pill} ${styles.quiet}`}
        aria-label={`Don't add ${label}`}
        onClick={() => review.dontAdd(view)}
      >
        Don&apos;t add
      </button>
    </div>
  )
}

/** One payment to review. Without write access (an offline copy) it is shown and nothing can be pressed. */
export function ReviewRow({ view, review, onReview }: { view: ReviewView; review: ReviewApi; onReview: OnReview }) {
  const failure = review.failures.get(view.rec.id)
  // A missing category, account or merchant is already marked in the fields themselves.
  const chips = view.reasons.filter((r) => !IN_FIELDS.has(r))
  return (
    <li className={styles.row}>
      <Fields view={view} />
      <SeriesLine view={view} review={review} onReview={onReview} />
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
