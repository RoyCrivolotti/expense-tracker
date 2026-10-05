import { useState } from 'react'
import type { AnalyticsBasis, AnalyticsPeriod, CompareMode } from '../../engine'

export interface AnalyticsFilters {
  basis: AnalyticsBasis
  setBasis: (next: AnalyticsBasis) => void
  period: AnalyticsPeriod
  setPeriod: (next: AnalyticsPeriod) => void
  compare: CompareMode
  setCompare: (next: CompareMode) => void
}

/**
 * The Analytics filter state. Committed is the default basis: it matches
 * budgets and the Dashboard (decision: the toggle is visible, the basis is
 * named next to it, and Cash — inherently paid — never offers it). Compare
 * only applies to the single-month period; a window period is compared with
 * the same months a year earlier.
 */
export function useAnalyticsFilters(): AnalyticsFilters {
  const [basis, setBasis] = useState<AnalyticsBasis>('committed')
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [compare, setCompare] = useState<CompareMode>('prevMonth')
  return { basis, setBasis, period, setPeriod, compare, setCompare }
}
