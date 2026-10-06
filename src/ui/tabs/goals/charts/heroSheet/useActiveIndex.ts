import { useCallback, useRef, useState, type RefObject } from 'react'

/**
 * The year a chart has pointed at, and the last one it had. The chart lets go of its year at a tap
 * outside it, and the tap that opens the full-screen chart is one, so by the time that tap is
 * handled the year is gone: the last one is what the full-screen chart opens on.
 */
export function useActiveIndex(): {
  activeIndex: number | null
  onActiveIndexChange: (index: number | null) => void
  lastIndex: RefObject<number | null>
} {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const lastIndex = useRef<number | null>(null)
  const onActiveIndexChange = useCallback((index: number | null) => {
    if (index !== null) lastIndex.current = index
    setActiveIndex(index)
  }, [])
  return { activeIndex, onActiveIndexChange, lastIndex }
}
