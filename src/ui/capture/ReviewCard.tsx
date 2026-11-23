import { useEffect, useRef } from 'react'
import { Presence } from '../components/Presence'
import { Card } from '../components/primitives'
import { EXIT_MS } from '../hooks/motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { ReviewCore } from './reviewContext'
import { SHOWN_PHONE, SHOWN_WIDE, rowsShown } from './reviewFormat'
import { pendingReviewId, withoutReview } from './reviewLanding'
import { ReviewRow, type OnReview } from './ReviewRow'
import { ReviewSheet } from './ReviewSheet'
import { useReviewApi, type ReviewApi } from './useReviewApi'
import styles from './Review.module.css'

function CardBody({
  review,
  onSheet,
  onReview,
}: {
  review: ReviewApi
  onSheet: (open: boolean) => void
  onReview: OnReview
}) {
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
      <p className={styles.hint}>
        From your bank pushes. Nothing is added until you add it. &ldquo;Don&apos;t add&rdquo; only removes that one
        suggestion.
      </p>
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

/**
 * Opens the payment a notification was tapped for (`?review=<id>` on the URL), once, as soon as the list has landed, and
 * takes the id off the URL. A payment no longer waiting (decided on another device) opens nothing: the card is there.
 * The id is looked for in the rows loaded, the newest page, which is where a payment just notified is; with nothing
 * waiting at all the card never mounts and the parameter stays, harmless, until the next load.
 */
function useLanding(
  review: ReviewApi,
  loads: number,
) {
  const landed = useRef(false)
  useEffect(() => {
    if (landed.current || loads === 0) return
    landed.current = true
    const id = pendingReviewId(window.location.search)
    if (id === null) return
    window.history.replaceState(window.history.state, '', withoutReview(new URL(window.location.href)))
    const view = review.views.find((v) => v.rec.id === id)
    if (view && review.canWrite) review.review(view)
  }, [loads, review])
}

/** The card at the top of the Dashboard: the payments waiting for a look, the newest few, each with its buttons. */
export default function ReviewCard({
  core,
  sheet,
  onSheet,
}: {
  core: ReviewCore
  sheet: boolean
  onSheet: (open: boolean) => void
}) {
  const review = useReviewApi(core)
  useLanding(review, core.loads)
  // Every way into the form closes the sheet first, so saving lands back on the Dashboard.
  const open: OnReview = (
    view,
    series,
  ) => {
    onSheet(false)
    if (series) review.reviewAs(view, series)
    else review.review(view)
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
