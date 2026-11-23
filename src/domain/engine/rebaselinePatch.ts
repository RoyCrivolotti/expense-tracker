/**
 * What a re-baseline changes. Moving the plan's start to the latest check-in moves the
 * calendar every projection year maps to, and life events and the house purchase are
 * keyed by projection year, so left alone they would replay from the new start: an
 * inheritance already inside the balance would be added again a year on. They keep
 * their calendar dates instead: an event dated on or before the check-in is dropped,
 * since its money is in the balance the plan restarts from, and a later one lands on
 * the first anniversary of the new start at or after its date. A plan with changes to
 * the monthly amount restarts from the amount in force at the check-in and keeps only the
 * changes still to come, on their own months.
 *
 * Moving the start also moves the euros the plan counts in. Spending, rent, fees and the amount of
 * an event are typed in the euros of the plan start, so after three years at 2% inflation a
 * 30.000 € spend is 31.836 € in the euros of the new start; left as typed it would be read as
 * 30.000 € of today and the FI target would come out about 6% too low. A house not yet bought is
 * today's price, which grew by the house's own rate over those years. A house already bought is
 * encoded without a column of its own: owned from day one, worth what it is worth now, with what
 * is still owed as its loan, over the term that is left.
 */
import type { ContributionStep, GoalScenario, LifeEvent } from '../types'
import { isCalendarDate } from './dates'
import { restartHouse } from './rebaselineHouse'
import { carryEvents, carryPurchase, yearsMoved } from './rebaselineCarry'

export interface RebaselinePatch {
  startInvestedCents: number
  planStartDate: string
  lifeEvents: LifeEvent[]
  housePurchaseYear: number | null
  monthlyContributionCents: number
  /** The changes to the monthly amount that start after the check-in. */
  contributionSchedule: ContributionStep[]
  /** Spending at FI, rent and the purchase fees, in the euros of the new start. */
  annualSpendCents: number
  rentMonthlyCents: number
  transactionCostsCents: number
  /** The price of a house not yet bought, or the value of one that is. */
  housePriceCents: number
  /** For a house already bought, the share that is not owed any more. */
  downPaymentFraction: number
  /** For a house already bought, the years of the loan left: a fraction of a year, not rounded. */
  mortgageTermYears: number
}

/** A house already bought, as the plan now holds it. */
export interface OwnedHouse {
  /** What it is worth now, in the euros of the new start. */
  valueCents: number
  /** What is assumed to be still owed, from the loan's schedule: no balance is read from anywhere. */
  owedCents: number
  /** The years of the loan left. */
  remainingYears: number
  /** The owed amount was above the value, which the plan cannot hold, so the value was raised to it. */
  raisedToOwed: boolean
}

/** A life event with the date it had and the one it now has; null when it is dropped. */
export interface CarriedEvent {
  event: LifeEvent
  from: string
  to: string | null
}

export interface Rebaseline {
  /** The fields to write; nothing else, so the patch can go straight to the scenario. */
  patch: RebaselinePatch
  /** Events dated on or before the check-in, left out of the patch. */
  droppedLifeEvents: LifeEvent[]
  /** Every event's old and new date, for saying what moved. Empty without an old start. */
  carried: CarriedEvent[]
  /** Changes to the monthly amount that began by the check-in, now part of the monthly amount. */
  droppedSteps: ContributionStep[]
  /** The house purchase's old and new date; `to` is null when it is now behind the start. */
  house: { from: string; to: string | null } | null
  /** What the plan started from before, for saying what is being replaced. */
  previous: { investedCents: number; planStartDate: string | null; monthlyContributionCents: number }
  /**
   * What moved to the euros of the new start: the years and the inflation they were moved by, and the
   * spending, rent and fees before and after. Null when nothing was restated.
   */
  restated: {
    years: number
    inflationRate: number
    spend: [number, number]
    rent: [number, number]
    fees: [number, number]
  } | null
  /** A house not yet bought: today's price, what it grew to by the house's own rate, and that rate. Null when it did not move. */
  housePrice: { from: number; to: number; appreciation: number } | null
  /** A house already bought, as it is now held; null when there is none. */
  ownedHouse: OwnedHouse | null
}

export type Rebaselinable = Pick<
  GoalScenario,
  | 'planStartDate'
  | 'lifeEvents'
  | 'housePurchaseYear'
  | 'startInvestedCents'
  | 'monthlyContributionCents'
  | 'contributionSchedule'
  | 'annualSpendCents'
  | 'rentMonthlyCents'
  | 'transactionCostsCents'
  | 'housePriceCents'
  | 'downPaymentFraction'
  | 'mortgageTermYears'
  | 'mortgageRateAnnual'
  | 'houseAppreciationRate'
>

/**
 * What the monthly amount restarts from at the check-in. A change that began by then is the
 * amount now and is dropped; the ones still to come keep their months, which count from the new
 * start by themselves. With no old start the changes never applied, so they are left to the
 * engine, which reads the ones before the new start as the amount it starts with.
 */
function restartContribution(
  scenario: Rebaselinable,
  oldStart: string | null,
  checkinDate: string,
): { monthlyContributionCents: number; contributionSchedule: ContributionStep[]; droppedSteps: ContributionStep[] } {
  const schedule = scenario.contributionSchedule ?? []
  const month = checkinDate.slice(0, 7)
  const begun = oldStart ? schedule.filter((s) => s.from <= month) : []
  const inForce = begun.reduce<ContributionStep | null>(
    (latest, s) => (!latest || s.from > latest.from ? s : latest),
    null,
  )
  return {
    monthlyContributionCents: inForce ? inForce.monthlyCents : scenario.monthlyContributionCents,
    contributionSchedule: oldStart ? schedule.filter((s) => s.from > month) : [...schedule],
    droppedSteps: begun,
  }
}

/**
 * The scenario restarted on `at.date` from `at.investedCents`. The date is usually the latest check-in,
 * but nothing here needs it to be one, or in the past: a copy started at a later date is the same
 * restart (`startLater`). "Already happened" means on or before that date. `costsEarly` puts a cost
 * (a negative event, the house purchase) on the anniversary on or before its date rather than after,
 * which a copy started later needs to stay cautious (`carriedYear`); a re-baseline at a check-in keeps
 * the next anniversary.
 */
export function rebaseline(
  scenario: Rebaselinable,
  at: { investedCents: number; date: string },
  inflationRate: number,
  { costsEarly = false }: { costsEarly?: boolean } = {},
): Rebaseline {
  // A start that is not a day on the calendar (only an API could have written one) reads as none.
  const oldStart = scenario.planStartDate && isCalendarDate(scenario.planStartDate) ? scenario.planStartDate : null
  const moved = yearsMoved(oldStart, at.date)
  // The euros of the new start: what was typed in the euros of the old one, by the inflation between.
  const factor = Math.pow(1 + inflationRate, moved)
  const restate = (cents: number) => Math.round(cents * factor)
  const { lifeEvents, droppedLifeEvents, carried } = carryEvents(
    scenario.lifeEvents,
    oldStart,
    at.date,
    restate,
    costsEarly,
  )
  const { housePurchaseYear, house } = carryPurchase(scenario.housePurchaseYear, oldStart, at.date, costsEarly)
  const { monthlyContributionCents, contributionSchedule, droppedSteps } = restartContribution(
    scenario,
    oldStart,
    at.date,
  )
  const {
    fields: houseFields,
    priceMoved,
    owned,
  } = restartHouse(scenario, oldStart, at.date, inflationRate, costsEarly)
  const spend = restate(scenario.annualSpendCents)
  const rent = restate(scenario.rentMonthlyCents)
  const fees = restate(scenario.transactionCostsCents)
  return {
    patch: {
      startInvestedCents: at.investedCents,
      planStartDate: at.date,
      lifeEvents,
      housePurchaseYear,
      monthlyContributionCents,
      contributionSchedule,
      annualSpendCents: spend,
      rentMonthlyCents: rent,
      transactionCostsCents: fees,
      ...houseFields,
    },
    restated:
      moved > 0 && factor !== 1
        ? {
            years: moved,
            inflationRate,
            spend: [scenario.annualSpendCents, spend],
            rent: [scenario.rentMonthlyCents, rent],
            fees: [scenario.transactionCostsCents, fees],
          }
        : null,
    housePrice: priceMoved,
    ownedHouse: owned,
    droppedLifeEvents,
    droppedSteps,
    carried,
    house,
    previous: {
      investedCents: scenario.startInvestedCents,
      planStartDate: oldStart,
      monthlyContributionCents: scenario.monthlyContributionCents,
    },
  }
}
