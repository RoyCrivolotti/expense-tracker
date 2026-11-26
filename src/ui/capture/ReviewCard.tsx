import { useEffect, useId, useRef } from 'react'
import { Presence } from '../components/Presence'
import { Card } from '../components/primitives'
import { EXIT_MS } from '../hooks/motion'
import { useIsMobile } from '../hooks/useIsMobile'
import type { ReviewCore } from './reviewContext'
import { SHOWN_PHONE, SHOWN_WIDE, rowsShown } from './reviewFormat'
import { pendingReviewId, withoutReview } from './reviewLanding'
import { ReviewHeader } from './ReviewHeader'
import { ReviewRows, type OnReview } from './ReviewRow'
import { localToday } from './reviewToday'
import { ReviewSheet } from './ReviewSheet'
import { useCardFold } from './useCardFold'
import { useReviewApi, type ReviewApi } from './useReviewApi'
import styles from './ReviewList.module.css'

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
  const [open, setOpen] = useCardFold()
  const body = useId()
  // The shell's own breakpoint: below 768px it is a phone layout.
  const shown = rowsShown(views.length, useIsMobile() ? SHOWN_PHONE : SHOWN_WIDE)
  return (
    <Card className={`${styles.card} ${open ? styles.open : ''}`}>
      <ReviewHeader count={count} totals={review.totals} open={open} controls={body} onOpen={setOpen} />
      <div id={body} className={styles.body} inert={!open}>
        <div className={styles.inner}>
          {review.canWrite ? null : (
            <p className={styles.readOnly}>Saved copy. You can add these when you are back online.</p>
          )}
          {review.error ? (
            <p role="alert" className={styles.error}>
              {review.error}{' '}
              <button type="button" className={styles.link} onClick={review.retry}>
                Try again
              </button>
            </p>
          ) : null}
          <ReviewRows
            views={views.slice(0, shown)}
            place="card"
            today={localToday()}
            review={review}
            onReview={onReview}
          />
          {views.length > shown || review.hasMore ? (
            <div className={styles.foot}>
              <button type="button" className={styles.link} onClick={() => onSheet(true)}>
                See all {count}
              </button>
            </div>
          ) : null}
        </div>
      </div>
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

/**
 * The card at the top of the Dashboard: one line saying how many payments wait and what they add up to, which opens
 * to the newest few. It stays the way it was left.
 */
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
