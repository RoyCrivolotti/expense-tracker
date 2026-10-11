import { useEffect, useState } from 'react'

/**
 * The latest value once it has stopped changing for `quietMs`; until then, the one before. The first
 * value is returned at once, so a component that mounts with it has no wait to show it. For work
 * that costs more than one edit's worth of time and that no one watches while they are still editing.
 * A `quietMs` of 0 or less returns the value as it comes.
 */
export function useQuietValue<T>(value: T, quietMs: number): T {
  const [quiet, setQuiet] = useState(value)
  useEffect(() => {
    if (quietMs <= 0) return undefined
    const id = setTimeout(() => setQuiet(value), quietMs)
    return () => clearTimeout(id)
  }, [value, quietMs])
  return quietMs > 0 ? quiet : value
}
