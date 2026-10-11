import type { ProjectionParams } from './projection'

/**
 * How much faster than inflation a house price rises each year. The appreciation a user enters is
 * as a price index quotes it (before inflation), and the plan's money is the euros of its start, so
 * only what the house beats inflation by counts.
 */
export function realHouseGrowth(appreciation: number, inflationRate: number): number {
  return (1 + appreciation) / (1 + inflationRate)
}

type HousePriceInput = Pick<
  ProjectionParams,
  'housePriceCents' | 'houseAppreciationRate' | 'housePurchaseYear' | 'inflationRate'
>

/**
 * What the house costs on the day it is bought, in the plan's money (euros of the plan start). The
 * price entered is today's, so a house bought in year 8 has had eight years to rise. No purchase,
 * or a house already owned, leaves the price as entered.
 */
export function housePriceAtPurchaseCents(input: HousePriceInput): number {
  const year = input.housePurchaseYear
  if (year === null || year <= 0) return input.housePriceCents
  const growth = realHouseGrowth(input.houseAppreciationRate, input.inflationRate)
  return Math.round(input.housePriceCents * Math.pow(growth, year))
}
