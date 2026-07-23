import { createContext, useContext } from 'react'
import { EU_MONEY_FORMAT, type MoneyFormat } from '../../engine/money'

export const MoneyFormatContext = createContext<MoneyFormat>(EU_MONEY_FORMAT)

/**
 * Read the app-wide currency/number format. Components use this; pure helpers
 * that format money take a `MoneyFormat` argument instead.
 */
export function useMoneyFormat(): MoneyFormat {
  return useContext(MoneyFormatContext)
}
