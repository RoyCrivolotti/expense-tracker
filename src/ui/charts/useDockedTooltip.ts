import { useEffect, useState } from 'react'

const DOCK_MQ = '(max-width: 719px)'

/** On narrow viewports, show tooltip docked below the chart instead of floating. */
export function useDockedTooltip(): boolean {
  const [docked, setDocked] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DOCK_MQ).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(DOCK_MQ)
    const onChange = () => setDocked(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return docked
}
