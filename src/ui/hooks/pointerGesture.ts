/** What a gesture does at each stage; `S` is whatever it measured when the pointer came down. */
export interface Gesture<S> {
  start: (e: PointerEvent) => S
  move: (state: S, e: PointerEvent) => void
  finish: (state: S) => void
}

/**
 * A pointer taken by `handle` and followed until it lifts, is cancelled or is lost, by one pointer
 * and only a primary one (and only the main button of a mouse). Listeners are on the handle, with
 * the pointer captured to it, so React is not in the path of a move. `end` is the one way out, and
 * can be called at any time, by a resize that has made what the gesture measured out of date.
 */
export function attachGesture<S>(
  handle: HTMLElement,
  marker: HTMLElement,
  gesture: Gesture<S>,
): { end: () => void; detach: () => void } {
  let live: { state: S; id: number } | null = null

  const onMove = (e: PointerEvent) => {
    if (live?.id === e.pointerId) gesture.move(live.state, e)
  }
  const end = () => {
    const ended = live
    if (!ended) return
    live = null
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', end)
    handle.removeEventListener('pointercancel', end)
    handle.removeEventListener('lostpointercapture', end)
    try {
      handle.releasePointerCapture(ended.id)
    } catch {
      // Already let go of, which is what a lost capture is.
    }
    delete marker.dataset.dragging
    gesture.finish(ended.state)
  }
  const onDown = (e: PointerEvent) => {
    if (live || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    if (e.pointerType !== 'mouse') e.preventDefault()
    live = { state: gesture.start(e), id: e.pointerId }
    try {
      handle.setPointerCapture(e.pointerId)
    } catch {
      // Not a pointer that can be captured: the gesture then ends with the pointer leaving the handle.
    }
    marker.dataset.dragging = 'true'
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
    handle.addEventListener('lostpointercapture', end)
  }

  handle.addEventListener('pointerdown', onDown)
  return {
    end,
    detach() {
      end()
      handle.removeEventListener('pointerdown', onDown)
    },
  }
}
