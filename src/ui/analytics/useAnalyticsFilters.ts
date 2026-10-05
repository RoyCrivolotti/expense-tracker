import { useState } from 'react'
import type { AnalyticsBasis } from '../../engine'

export interface AnalyticsFilters {
  basis: AnalyticsBasis
  setBasis: (next: AnalyticsBasis) => void
}

/**
 * The Analytics filter state. Committed is the default basis: it matches
 * budgets and the Dashboard (decision: the toggle is visible, the basis is
 * named next to it, and Cash — inherently paid — never offers it).
 */
export function useAnalyticsFilters(): AnalyticsFilters {
  const [basis, setBasis] = useState<AnalyticsBasis>('committed')
  return { basis, setBasis }
}
