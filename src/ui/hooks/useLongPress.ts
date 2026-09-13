import { useRef, type TouchEvent } from 'react'

const DEFAULT_DELAY = 400
const DEFAULT_MOVE_THRESHOLD = 10

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
