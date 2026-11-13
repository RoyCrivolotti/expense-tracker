import { Presence } from '../components/Presence'
import { Card } from '../components/primitives'
import { EXIT_MS } from '../hooks/motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { ReviewCore } from './reviewContext'
import type { ReviewView } from './reviewFields'
import { SHOWN_PHONE, SHOWN_WIDE, rowsShown } from './reviewFormat'
import { ReviewRow } from './ReviewRow'
import { ReviewSheet } from './ReviewSheet'
import { useReviewApi, type ReviewApi } from './useReviewApi'
import styles from './Review.module.css'

function CardBody({ review, onSheet, onReview }: { review: ReviewApi; onSheet: (open: boolean) => void; onReview: (view: ReviewView) => void }) {
  const { views, count } = review
  // The shell's own breakpoint: below 768px it is a phone layout.
  const shown = rowsShown(views.length, useIsMobile() ? SHOWN_PHONE : SHOWN_WIDE)
  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <h2 className={styles.title}>{count === 1 ? '1 payment to review' : `${count} payments to review`}</h2>
        {views.length > shown || review.hasMore ? (
          <button type="button" className={styles.link} onClick={() => onSheet(true)}>
            See all {count}
          </button>
        ) : null}
      </div>
      <p className={styles.hint}>From your bank pushes. Nothing is added until you add it. &ldquo;Don&apos;t add&rdquo; only removes that one suggestion.</p>
      {review.error ? (
        <p role="alert" className={styles.error}>
          {review.error}{' '}
          <button type="button" className={styles.link} onClick={review.retry}>
            Try again
          </button>
        </p>
      ) : null}
      <ul className={styles.rows}>
        {views.slice(0, shown).map((view) => (
          <ReviewRow key={view.rec.id} view={view} review={review} onReview={onReview} />
        ))}
      </ul>
    </Card>
  )
}

/** The card at the top of the Dashboard: the payments waiting for a look, the newest few, each with its buttons. */
export default function ReviewCard({ core, sheet, onSheet }: { core: ReviewCore; sheet: boolean; onSheet: (open: boolean) => void }) {
  const review = useReviewApi(core)
  const open = (view: ReviewView) => {
    onSheet(false)
    review.review(view)
  }
  return (
    <>
      {review.views.length > 0 ? <CardBody review={review} onSheet={onSheet} onReview={open} /> : null}
      <Presence show={sheet} exitMs={EXIT_MS.sheet}>
        <ReviewSheet review={review} onClose={() => onSheet(false)} onReview={open} />
      </Presence>
    </>
  )
}
