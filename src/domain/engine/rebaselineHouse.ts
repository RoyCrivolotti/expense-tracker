/**
 * What a re-baseline does to the house: a house not yet bought is repriced by its own growth, and a house already
 * bought is held as owned from the first day, with the loan that is left.
 */
import { yearsBetween } from './dates'
import { housePriceAtPurchaseCents } from './housePrice'
import { anniversary, carriedYear, yearsMoved } from './rebaselineCarry'
import type { OwnedHouse, Rebaseline, Rebaselinable, RebaselinePatch } from './rebaselinePatch'

/**
 * The balance of a loan after `months` of payments, as a bank runs it: the payment is fixed, the
 * interest is on what is left. `months` can be a fraction (the check-in is not on a payment day), and
 * the closed form holds for it, so a chain of restarts agrees with one made all at once.
 */
function loanBalance(
  loan: number,
  ratePerYear: number,
  termMonths: number,
  months: number,
): number {
  if (loan <= 0 || months >= termMonths) return 0
  const rate = ratePerYear / 12
  if (rate === 0) return loan * (1 - months / termMonths)
  const payment = (loan * rate) / (1 - Math.pow(1 + rate, -termMonths))
  const growth = Math.pow(1 + rate, months)
  return Math.max(0, loan * growth - (payment * (growth - 1)) / rate)
}

type HouseFields = Pick<RebaselinePatch, 'housePriceCents' | 'downPaymentFraction' | 'mortgageTermYears'>

/**
 * What the house is after the start moves `moved` years on. A house not yet bought is its price grown
 * by the house's own rate (the engine then grows it by what it beats inflation by from the new
 * start). A house already bought, or owned from the first day, is held as owned from day one: worth
 * its price grown the same way, with what is still owed after the payments so far as its loan and the
 * term that is left. Anything it cannot read (no price, no term) is left as typed.
 */
export function restartHouse(
  scenario: Rebaselinable,
  oldStart: string | null,
  newDate: string,
  inflationRate: number,
  early: boolean,
): { fields: HouseFields; priceMoved: Rebaseline['housePrice']; owned: OwnedHouse | null } {
  const typed: HouseFields = {
    housePriceCents: scenario.housePriceCents,
    downPaymentFraction: scenario.downPaymentFraction,
    mortgageTermYears: scenario.mortgageTermYears,
  }
  const moved = yearsMoved(oldStart, newDate)
  if (!oldStart || moved === 0 || !(scenario.housePriceCents > 0))
    return { fields: typed, priceMoved: null, owned: null }
  const value = Math.round(scenario.housePriceCents * Math.pow(1 + scenario.houseAppreciationRate, moved))
  const purchase = scenario.housePurchaseYear
  const bought =
    purchase === 0 || (purchase !== null && carriedYear(purchase, oldStart, newDate, newDate, early) === null)
  if (!bought) {
    const priceMoved =
      value === scenario.housePriceCents
        ? null
        : { from: scenario.housePriceCents, to: value, appreciation: scenario.houseAppreciationRate }
    return { fields: { ...typed, housePriceCents: value }, priceMoved, owned: null }
  }
  return { ...ownedHouse(scenario, oldStart, newDate, value, inflationRate), priceMoved: null }
}

function ownedHouse(
  scenario: Rebaselinable,
  oldStart: string,
  newDate: string,
  value: number,
  inflationRate: number,
): { fields: HouseFields; owned: OwnedHouse | null } {
  const termMonths = scenario.mortgageTermYears * 12
  const typed: HouseFields = {
    housePriceCents: value,
    downPaymentFraction: scenario.downPaymentFraction,
    mortgageTermYears: scenario.mortgageTermYears,
  }
  if (!(termMonths > 0)) return { fields: typed, owned: null }
  const purchase = scenario.housePurchaseYear ?? 0
  const elapsed = Math.max(0, yearsBetween(anniversary(oldStart, purchase), newDate))
  // The loan as the engine took it at the purchase, in plan euros, then in the euros paid on the day.
  const atPurchase = housePriceAtPurchaseCents({ ...scenario, inflationRate })
  const loan =
    (atPurchase - Math.round(atPurchase * scenario.downPaymentFraction)) * Math.pow(1 + inflationRate, purchase)
  const owedCents = Math.round(loanBalance(loan, scenario.mortgageRateAnnual, termMonths, elapsed * 12))
  const raised = owedCents > value
  const price = raised ? owedCents : value
  const remainingYears = owedCents === 0 ? scenario.mortgageTermYears : scenario.mortgageTermYears - elapsed
  return {
    fields: {
      housePriceCents: price,
      downPaymentFraction: owedCents === 0 ? 1 : 1 - owedCents / price,
      mortgageTermYears: remainingYears,
    },
    owned: { valueCents: price, owedCents, remainingYears, raisedToOwed: raised },
  }
}
