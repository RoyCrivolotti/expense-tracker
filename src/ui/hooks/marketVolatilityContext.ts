import { createContext, useContext } from 'react'
import { DEFAULT_MARKET_VOLATILITY } from '../../engine'

/**
 * The owner's market bounce, provided once for the whole app from their settings. The default is only for
 * tests and partial mounts, the way the assumed inflation's is: the engine takes the bounce as an argument.
 */
export const MarketVolatilityContext = createContext<number>(DEFAULT_MARKET_VOLATILITY)

/** Read the market bounce. Components use this; pure helpers take it as an argument. */
export function useMarketVolatility(): number {
  return useContext(MarketVolatilityContext)
}
