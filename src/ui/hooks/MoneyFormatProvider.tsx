import { useMemo, type ReactNode } from 'react'
import { resolveMoneyFormat } from '../../engine/money'
import { MoneyFormatContext } from './moneyFormatContext'

/**
 * Provides the resolved currency/number format for the whole app, derived from
 * the owner's settings. Components read it with `useMoneyFormat()`; pure helpers
 * that format money take a `MoneyFormat` argument instead.
 */
export function MoneyFormatProvider({
  currencyCode,
  numberLocale,
  children,
}: {
  currencyCode: string
  numberLocale: string
  children: ReactNode
}) {
  const format = useMemo(
    () => resolveMoneyFormat(currencyCode, numberLocale),
    [currencyCode, numberLocale],
  )
  return <MoneyFormatContext.Provider value={format}>{children}</MoneyFormatContext.Provider>
}
