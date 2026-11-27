import { useEffect, useRef } from 'react'
import type { SeedQueue } from '../seedQueue'
import { BackIcon, ChevronIcon } from '../icons'
import { useQueueSpot, type PageDirection } from './reviewPages'
import styles from './QueuePager.module.css'

/**
 * The review sheet's arrows and "2 of 6", beside its title: they move to the payment before or after without deciding
 * the one on screen. None at the first or last payment, and no pager at all with one payment waiting. Pressing an
 * arrow keeps the cursor on it; reaching the end of the list moves it to the other arrow rather than losing it.
 */
export function QueuePager({
  queue,
  busy,
  onMove,
}: {
  queue: SeedQueue
  /** The payment on screen is being saved, or has a picker open: the arrows wait for it. */
  busy: boolean
  onMove: (dir: PageDirection) => void
}) {
  const { at, of } = useQueueSpot(queue)
  const previous = useRef<HTMLButtonElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const pressed = useRef<PageDirection | null>(null)
  const first = at <= 1
  const last = at >= of
  useEffect(() => {
    const [from, to] = pressed.current === 'previous' ? [previous, next] : [next, previous]
    const active = document.activeElement
    // Only when the cursor was on the arrow that just switched off: a field being typed in keeps it.
    const lost = active === null || active === document.body || active === from.current
    if (pressed.current && from.current?.disabled && lost) to.current?.focus()
  }, [first, last])
  if (at === 0 || of < 2) return null
  const press = (dir: PageDirection) => {
    pressed.current = dir
    onMove(dir)
  }
  return (
    <div className={styles.pager} role="group" aria-label="Payments to review">
      <button
        ref={previous}
        type="button"
        className={`${styles.arrow} tapActive`}
        aria-label="Previous payment"
        disabled={first || busy}
        onClick={() => press('previous')}
      >
        <BackIcon width={20} height={20} />
      </button>
      <span className={styles.count} aria-live="polite" aria-atomic="true">
        <span className={styles.srOnly}>Payment </span>
        {at} of {of}
      </span>
      <button
        ref={next}
        type="button"
        className={`${styles.arrow} tapActive`}
        aria-label="Next payment"
        disabled={last || busy}
        onClick={() => press('next')}
      >
        <ChevronIcon width={20} height={20} />
      </button>
    </div>
  )
}
