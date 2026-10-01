import { useEffect, useRef } from 'react'

/**
 * A toggle function for a controlled id array that stays correct under two
 * toggles fired before `value` has round-tripped back from the parent as a
 * new prop. Computing straight off `value` would have both calls read the
 * same stale array — tapping one id then another, back to back, could lose
 * the first tap; tapping the same id twice could add it twice over instead
 * of landing back where it started. The ref is the source of truth for what
 * this hook has already told the caller, updated synchronously on every
 * toggle and resynced from `value` whenever it actually changes.
 */
export function useToggleIds(value: number[], onChange: (next: number[]) => void) {
  const pending = useRef(value)
  useEffect(() => {
    pending.current = value
  }, [value])

  return (id: number) => {
    const current = pending.current
    const next = current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
    pending.current = next
    onChange(next)
  }
}
