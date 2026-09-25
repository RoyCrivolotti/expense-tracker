import { createContext, useContext } from 'react'
import { DEFAULT_INFLATION_RATE } from '../../engine'

/**
 * The owner's assumed inflation, provided once for the whole app from their settings. The
 * default is only for tests and partial mounts, the way the money format's is: the engine
 * itself takes the rate as an argument and has no fallback.
 */
export const AssumedInflationContext = createContext<number>(DEFAULT_INFLATION_RATE)

/** Read the assumed inflation. Components use this; pure helpers take the rate as an argument. */
export function useAssumedInflation(): number {
  return useContext(AssumedInflationContext)
}
