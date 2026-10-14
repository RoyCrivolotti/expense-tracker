import { useRef, type TouchEvent } from 'react'

const DEFAULT_DELAY = 400
const DEFAULT_MOVE_THRESHOLD = 10
/** How long after a long press fires a click is still taken to be its lift. A hold has no upper
 *  bound, so this is generous; the next touch ends it sooner. */
const CLICK_WINDOW_MS = 5000

/**
 * Drops the click that follows the lift of a long press. Handling that in `onTouchEnd` is not
 * enough: whatever a long press triggers (select mode swaps the row for a checkbox row) can
 * detach the element the finger went down on, and a touchend on a detached element never
 * reaches React. The click then lands on whatever is under the finger now, which un-ticks the
 * row that was just selected. Listens on `window` for that reason, and stands down at the next
 * touch so a later tap is never eaten.
 */
function swallowNextClick() {
  const done = new AbortController()
  const { signal } = done
  window.addEventListener(
    'click',
    (event) => {
      event.preventDefault()
      event.stopPropagation()
      done.abort()
    },
    { capture: true, signal },
  )
  window.addEventListener('touchstart', () => done.abort(), { capture: true, signal })
  setTimeout(() => done.abort(), CLICK_WINDOW_MS)
}

interface UseLongPressOptions {
  onLongPress: () => void
  delay?: number
  moveThreshold?: number
}

export function useLongPress({
  onLongPress,
  delay = DEFAULT_DELAY,
  moveThreshold = DEFAULT_MOVE_THRESHOLD,
}: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = useRef({ x: 0, y: 0 })
  const firedRef = useRef(false)

  const clear = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const onTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!touch) return
    firedRef.current = false
    startRef.current = { x: touch.clientX, y: touch.clientY }
    clear()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      firedRef.current = true
      navigator.vibrate?.(50)
      swallowNextClick()
      onLongPress()
    }, delay)
  }

  const onTouchMove = (e: TouchEvent) => {
    if (timerRef.current === null) return
    const touch = e.touches[0]
    if (!touch) return
    const dx = touch.clientX - startRef.current.x
    const dy = touch.clientY - startRef.current.y
    if (dx * dx + dy * dy > moveThreshold * moveThreshold) {
      clear()
    }
  }

  const onTouchEnd = (e: TouchEvent) => {
    clear()
    if (firedRef.current) {
      firedRef.current = false
      e.preventDefault()
    }
  }

  const onTouchCancel = () => {
    clear()
    firedRef.current = false
  }

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel }
}
