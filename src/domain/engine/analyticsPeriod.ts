/**
 * Analytics basis — which card charges count. `committed` counts a charge in
 * its budget month whether or not the statement is paid (matching budgets and
 * the Dashboard); `paid` counts it only once the statement is paid (matching
 * cash). Cash reconciliation is inherently paid-basis and offers no choice.
 */
export type AnalyticsBasis = 'committed' | 'paid'

export interface BasisOptions {
  includeForecast: boolean
}

/** The engine options (`computeMonthlyTotals`, `computeCategoryActuals`) for a basis. */
export function basisOptions(basis: AnalyticsBasis): BasisOptions {
  return { includeForecast: basis === 'committed' }
}
