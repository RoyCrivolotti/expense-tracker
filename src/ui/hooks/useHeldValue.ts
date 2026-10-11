import { useState } from 'react'

/**
 * The latest value while `live`. While it is not, the last one seen while it was (undefined if it
 * never was), so what is computed from it is left alone until `live` returns.
 */
export function useHeldValue<T>(value: T, live: boolean): T | undefined {
  const [held, setHeld] = useState<T | undefined>(live ? value : undefined)
  if (live && held !== value) setHeld(value)
  return live ? value : held
}
