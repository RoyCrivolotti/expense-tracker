import { useEffect, useRef } from 'react'
import { Modal } from '../components/Modal'
import type { ReviewApi } from './useReviewApi'
import type { ReviewView } from './reviewFields'
import { weekdayDay } from './reviewFormat'
import { ReviewRows, type OnReview } from './ReviewRow'
import { relativeDay } from './reviewRowText'
import { localToday } from './reviewToday'
import styles from './ReviewList.module.css'

/** Runs of payments on one day, in the order given. The announcement of a same-bill pair stays with its charge. */
function byDay(
  views: readonly ReviewView[],
  review: ReviewApi,
): { date: string; views: ReviewView[] }[] {
  const days: { date: string; views: ReviewView[] }[] = []
  for (const view of views) {
    const last = days[days.length - 1]
    const tied = review.pairs.get(view.rec.id)?.role === 'announcement'
    if (last && (last.date === view.date || tied)) last.views.push(view)
    else days.push({ date: view.date, views: [view] })
  }
  return days
}

/** "Today · Wed 25 Nov", "Yesterday · Tue 24 Nov", then the day alone. */
function dayHeading(
  date: string,
  today: string,
): string {
  const relative = relativeDay(date, today)
  const full = weekdayDay(date)
  return relative === full ? full : `${relative} · ${full}`
}

/**
 * While a payment opened from the list is on top of it, the list stands down: inert, with its focus trap and swipe
 * paused, so Tab, Escape and a drag reach only the payment. Coming back, focus returns to the row it was opened from,
 * or to the heading when that payment was decided in the meantime, never to the page behind.
 */
function useStackedFocus(stacked: boolean) {
  const wrapper = useRef<HTMLDivElement>(null)
  // The payment, not its button: Safari does not focus a tapped button, so the focus says nothing about which row it was.
  const opened = useRef<string | null>(null)
  const was = useRef(stacked)
  useEffect(() => {
    const dialog = wrapper.current?.querySelector<HTMLElement>('[role="dialog"]')
    if (was.current && !stacked && dialog) {
      const row =
        opened.current === null ? null : dialog.querySelector<HTMLElement>(`[data-review-id="${opened.current}"]`)
      ;(row ?? dialog.querySelector<HTMLElement>('h2'))?.focus({ preventScroll: true })
    }
    was.current = stacked
  }, [stacked])
  return { wrapper, remember: (view: ReviewView) => void (opened.current = view.rec.id) }
}

/** Every payment waiting for a look, by day. A row opens the add form on top, which then moves on to the next payment. */
export function ReviewSheet({
  review,
  stacked = false,
  onClose,
  onReview,
}: {
  review: ReviewApi
  /** A payment opened from here is on top. */
  stacked?: boolean
  onClose: () => void
  onReview: OnReview
}) {
  const today = localToday()
  const { wrapper, remember } = useStackedFocus(stacked)
  const open: OnReview = (
    view,
    series,
  ) => {
    remember(view)
    onReview(view, series)
  }
  return (
    // The wrapper is only there to carry `inert`: the overlay in it is fixed to the screen, so it takes no room here.
    <div ref={wrapper} inert={stacked}>
      <Modal title={`To review (${review.count})`} onClose={onClose} trapPaused={stacked}>
        {review.views.length === 0 ? (
          <p className={styles.empty} aria-live="polite">
            <b>All caught up</b>
            Nothing is waiting for a look.
          </p>
        ) : (
          byDay(review.views, review).map((day) => (
            // The first payment of the run, not the day: a day can come up twice when the list is not in date order.
            <div key={day.views[0]!.rec.id}>
              <h3 className={styles.day}>{dayHeading(day.date, today)}</h3>
              <ReviewRows views={day.views} place="sheet" today={today} review={review} onReview={open} />
            </div>
          ))
        )}
        {review.hasMore ? (
          <button type="button" className={styles.link} onClick={review.more}>
            Show more
          </button>
        ) : null}
        {review.views.length > 0 ? (
          <p className={styles.footNote}>
            {review.canWrite
              ? "From your bank's notifications. Nothing is added until you add it. Tap a payment to see the bank's message, change it, or choose “Don't add”."
              : 'Saved copy. You can add these when you are back online.'}
          </p>
        ) : null}
      </Modal>
    </div>
  )
}
