import { useEffect, useId, useRef, useState } from 'react'
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
 * A payment opened from the full list opens the form on top of it, and the list stays where it was underneath, so
 * closing the form goes back to it. When nothing is left to go back to, the list leaves with the form instead of
 * coming back empty. Whether anything is left is not always known as the form closes: "Don't add" takes the payment off
 * the list at once, but a save only shows in the read that follows it, which lands a moment later. So from the form
 * closing until that read has answered, a list that turns empty closes. A list emptied by its own one-tap buttons, with
 * no form, still says all caught up.
 *
 * Returns what the list shows: while it leaves for being empty, the last of it that had payments, so it slides away as
 * it was rather than as "All caught up".
 */
function useCloseWhenEmptied(
  review: ReviewApi,
  { stacked, reading }: { stacked: boolean; reading: boolean },
  onSheet: (open: boolean) => void,
): ReviewApi {
  const empty = review.views.length === 0
  const [was, setWas] = useState(stacked)
  const [armed, setArmed] = useState(false)
  const [full, setFull] = useState(review)
  if (was !== stacked) {
    setWas(stacked)
    setArmed(!stacked)
  } else if (armed && !empty && !reading) setArmed(false)
  if (!empty && full.views !== review.views) setFull(review)
  const closing = armed && empty
  useEffect(() => {
    if (closing) onSheet(false)
  }, [closing, onSheet])
  return closing ? full : review
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
  const formOpen = core.formOpen ?? false
  const listed = useCloseWhenEmptied(review, { stacked: sheet && formOpen, reading: core.reading ?? false }, onSheet)
  const open: OnReview = (
    view,
    series,
  ) => {
    if (series) review.reviewAs(view, series)
    else review.review(view)
  }
  return (
    <>
      {review.views.length > 0 ? <CardBody review={review} onSheet={onSheet} onReview={open} /> : null}
      <Presence show={sheet} exitMs={EXIT_MS.sheet}>
        <ReviewSheet review={listed} stacked={formOpen} onClose={() => onSheet(false)} onReview={open} />
      </Presence>
    </>
  )
}
