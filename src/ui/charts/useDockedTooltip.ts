import { useEffect, useState } from 'react'

const DOCK_MQ = '(max-width: 719px)'

// jsdom has no matchMedia, and a chart under test should not need to stub one just to draw.
function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/** On narrow viewports, dock the tooltip to the chart instead of floating it at the pointer. */
export function useDockedTooltip(): boolean {
  const [docked, setDocked] = useState(() => (canMatchMedia() ? window.matchMedia(DOCK_MQ).matches : false))

  useEffect(() => {
    if (!canMatchMedia()) return undefined
    const mq = window.matchMedia(DOCK_MQ)
    const onChange = () => setDocked(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return docked
}
