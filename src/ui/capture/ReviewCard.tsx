import { useState } from 'react'
import { Card } from '../components/primitives'
import type { ReviewCore } from './reviewContext'
import type { ReviewView } from './reviewFields'
import { ReviewRow } from './ReviewRow'
import { ReviewSheet } from './ReviewSheet'
import { useReviewApi } from './useReviewApi'
import styles from './Review.module.css'

/** How many payments the card shows. "See all" opens the rest. */
const SHOWN = 3

/** The card at the top of the Dashboard: the payments waiting for a look, the newest few, each with its buttons. */
export default function ReviewCard({ core }: { core: ReviewCore }) {
  const review = useReviewApi(core)
  const [all, setAll] = useState(false)
  const { views, count } = review
  const open = (view: ReviewView) => {
    setAll(false)
    review.review(view)
  }
  return (
    <>
      <Card className={styles.card}>
        <div className={styles.head}>
          <h2 className={styles.title}>{count === 1 ? '1 payment to review' : `${count} payments to review`}</h2>
          {views.length > SHOWN || review.hasMore ? (
            <button type="button" className={styles.link} onClick={() => setAll(true)}>
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
          {views.slice(0, SHOWN).map((view) => (
            <ReviewRow key={view.rec.id} view={view} review={review} onReview={open} />
          ))}
        </ul>
      </Card>
      {all ? <ReviewSheet review={review} onClose={() => setAll(false)} onReview={open} /> : null}
    </>
  )
}
