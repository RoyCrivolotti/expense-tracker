import { Modal } from '../components/Modal'
import { shortDayLabel } from '../format'
import type { ReviewApi } from './useReviewApi'
import type { ReviewView } from './reviewFields'
import { ReviewRow } from './ReviewRow'
import styles from './Review.module.css'

/** Runs of payments on one day, in the order given. */
function byDay(views: readonly ReviewView[]): { date: string; views: ReviewView[] }[] {
  const days: { date: string; views: ReviewView[] }[] = []
  for (const view of views) {
    const last = days[days.length - 1]
    if (last?.date === view.date) last.views.push(view)
    else days.push({ date: view.date, views: [view] })
  }
  return days
}

/** Every payment waiting for a look. Review opens the add form, which then moves on to the next payment. */
export function ReviewSheet({ review, onClose, onReview }: { review: ReviewApi; onClose: () => void; onReview: (view: ReviewView) => void }) {
  return (
    <Modal title={`To review (${review.count})`} onClose={onClose}>
      <p className={styles.hint}>&ldquo;Don&apos;t add&rdquo; only removes that one suggestion.</p>
      {review.views.length === 0 ? (
        <p className={styles.empty} aria-live="polite">
          All caught up.
        </p>
      ) : (
        byDay(review.views).map((day) => (
          <div key={day.date}>
            <h3 className={styles.day}>{shortDayLabel(day.date)}</h3>
            <ul className={styles.rows}>
              {day.views.map((view) => (
                <ReviewRow key={view.rec.id} view={view} review={review} onReview={onReview} />
              ))}
            </ul>
          </div>
        ))
      )}
      {review.hasMore ? (
        <button type="button" className={styles.link} onClick={review.more}>
          Show more
        </button>
      ) : null}
    </Modal>
  )
}
