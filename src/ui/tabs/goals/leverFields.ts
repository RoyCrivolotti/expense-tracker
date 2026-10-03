import type { LeverKey } from '../../../engine'

export type LeverKind = 'money' | 'percent' | 'years' | 'purchaseYear'

/** How one scenario input is labelled and bounded wherever it is edited: the panel, the bar. */
export interface LeverSpec {
  key: LeverKey
  kind: LeverKind
  /** The field's name in the panel, and the accessible name of its input in the bar. */
  label: string
  /** The shorter name over a lever in the bar. */
  short: string
  min?: number
  max?: number
}

/**
 * The bounds are the ones the controls have always had; the panel and the bar read them from
 * here so an input cannot be given one range in one place and another in the other.
 */
export const LEVER_SPECS: Record<LeverKey, LeverSpec> = {
  startInvestedCents: { key: 'startInvestedCents', kind: 'money', label: 'Starting invested', short: 'Starting invested' },
  monthlyContributionCents: { key: 'monthlyContributionCents', kind: 'money', label: 'Monthly investing', short: 'Monthly investing' },
  annualContributionGrowth: { key: 'annualContributionGrowth', kind: 'percent', label: 'Contribution growth (%/yr)', short: 'Contribution growth', min: 0, max: 0.1 },
  expectedRealReturn: { key: 'expectedRealReturn', kind: 'percent', label: 'Real return (%/yr, after inflation)', short: 'Real return', min: 0, max: 0.15 },
  horizonYears: { key: 'horizonYears', kind: 'years', label: 'Horizon (years)', short: 'Horizon', min: 1, max: 60 },
  housePriceCents: { key: 'housePriceCents', kind: 'money', label: 'House price', short: 'House price' },
  downPaymentFraction: { key: 'downPaymentFraction', kind: 'percent', label: 'Down payment', short: 'Down payment', min: 0, max: 0.5 },
  transactionCostsCents: { key: 'transactionCostsCents', kind: 'money', label: 'Purchase fees', short: 'Purchase fees' },
  mortgageRateAnnual: { key: 'mortgageRateAnnual', kind: 'percent', label: 'Mortgage rate (%/yr)', short: 'Mortgage rate', min: 0, max: 0.1 },
  mortgageTermYears: { key: 'mortgageTermYears', kind: 'years', label: 'Mortgage term (years)', short: 'Mortgage term', min: 1, max: 40 },
  houseAppreciationRate: { key: 'houseAppreciationRate', kind: 'percent', label: 'House appreciation (%/yr)', short: 'House appreciation', min: 0, max: 0.1 },
  housePurchaseYear: { key: 'housePurchaseYear', kind: 'purchaseYear', label: 'Purchase year', short: 'House purchase' },
  rentMonthlyCents: { key: 'rentMonthlyCents', kind: 'money', label: 'Rent (monthly)', short: 'Rent' },
  annualSpendCents: { key: 'annualSpendCents', kind: 'money', label: 'Annual spend at FI', short: 'Annual spend at FI' },
  safeWithdrawalRate: { key: 'safeWithdrawalRate', kind: 'percent', label: 'Withdrawal rate at FI', short: 'Withdrawal rate', min: 0.005, max: 0.06 },
}

/** Which inputs each section of the controls holds, in the order it shows them. */
export const SECTION_KEYS = {
  portfolio: ['startInvestedCents', 'monthlyContributionCents', 'annualContributionGrowth', 'expectedRealReturn', 'horizonYears'],
  housing: ['housePriceCents', 'downPaymentFraction', 'transactionCostsCents', 'mortgageRateAnnual', 'mortgageTermYears', 'houseAppreciationRate', 'housePurchaseYear', 'rentMonthlyCents'],
  fire: ['annualSpendCents', 'safeWithdrawalRate'],
} as const satisfies Record<string, readonly LeverKey[]>

export const NO_LEVERS: ReadonlySet<LeverKey> = new Set()
