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
import { isCalendarDate, utcDateMs, yearsBetween } from './dates'
import { housePriceAtPurchaseCents } from './housePrice'
import { currencyWord, formatCents, formatPercent, type MoneyFormat } from './money'

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
  restated: { years: number; inflationRate: number; spend: [number, number]; rent: [number, number]; fees: [number, number] } | null
  /** A house not yet bought: today's price, what it grew to by the house's own rate, and that rate. Null when it did not move. */
  housePrice: { from: number; to: number; appreciation: number } | null
  /** A house already bought, as it is now held; null when there is none. */
  ownedHouse: OwnedHouse | null
}

type Rebaselinable = Pick<
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

/** The same day of the year, `years` on, by the calendar rather than in days. */
function anniversary(iso: string, years: number): string {
  const d = new Date(utcDateMs(iso))
  d.setUTCFullYear(d.getUTCFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/**
 * Plan year `year` of the old start, as a plan year of the new one: the first anniversary
 * of the new start on or after the old date, never below one. Null when that date is on
 * or before the check-in, which is what "already happened" means here.
 */
function carriedYear(year: number, oldStart: string, newStart: string, checkin: string): number | null {
  const date = anniversary(oldStart, year)
  if (date <= checkin) return null
  let k = 1
  while (anniversary(newStart, k) < date) k += 1
  return k
}

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
  const inForce = begun.reduce<ContributionStep | null>((latest, s) => (!latest || s.from > latest.from ? s : latest), null)
  return {
    monthlyContributionCents: inForce ? inForce.monthlyCents : scenario.monthlyContributionCents,
    contributionSchedule: oldStart ? schedule.filter((s) => s.from > month) : [...schedule],
    droppedSteps: begun,
  }
}

/** The years the start moves forward by, to the day; 0 for no old start, a date that is not one, or a move that is not forward. */
function yearsMoved(oldStart: string | null, newDate: string): number {
  if (!oldStart) return 0
  const years = yearsBetween(oldStart, newDate)
  return Number.isFinite(years) && years > 0 ? years : 0
}

/**
 * The balance of a loan after `months` of payments, as a bank runs it: the payment is fixed, the
 * interest is on what is left. `months` can be a fraction (the check-in is not on a payment day), and
 * the closed form holds for it, so a chain of restarts agrees with one made all at once.
 */
function loanBalance(loan: number, ratePerYear: number, termMonths: number, months: number): number {
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
function restartHouse(
  scenario: Rebaselinable,
  oldStart: string | null,
  newDate: string,
  inflationRate: number,
): { fields: HouseFields; priceMoved: Rebaseline['housePrice']; owned: OwnedHouse | null } {
  const typed: HouseFields = {
    housePriceCents: scenario.housePriceCents,
    downPaymentFraction: scenario.downPaymentFraction,
    mortgageTermYears: scenario.mortgageTermYears,
  }
  const moved = yearsMoved(oldStart, newDate)
  if (!oldStart || moved === 0 || !(scenario.housePriceCents > 0)) return { fields: typed, priceMoved: null, owned: null }
  const value = Math.round(scenario.housePriceCents * Math.pow(1 + scenario.houseAppreciationRate, moved))
  const purchase = scenario.housePurchaseYear
  const bought = purchase === 0 || (purchase !== null && carriedYear(purchase, oldStart, newDate, newDate) === null)
  if (!bought) {
    const priceMoved = value === scenario.housePriceCents ? null : { from: scenario.housePriceCents, to: value, appreciation: scenario.houseAppreciationRate }
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
  const loan = (atPurchase - Math.round(atPurchase * scenario.downPaymentFraction)) * Math.pow(1 + inflationRate, purchase)
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

/** The life events on their calendar dates, in the euros of the new start, and what dropped out and moved. */
function carryEvents(
  events: LifeEvent[],
  oldStart: string | null,
  date: string,
  restate: (cents: number) => number,
): { lifeEvents: LifeEvent[]; droppedLifeEvents: LifeEvent[]; carried: CarriedEvent[] } {
  const years = events.map((event) => (oldStart ? carriedYear(event.year, oldStart, date, date) : event.year))
  const lifeEvents: LifeEvent[] = []
  const droppedLifeEvents: LifeEvent[] = []
  events.forEach((event, i) => {
    const year = years[i] ?? null
    if (year === null) droppedLifeEvents.push(event)
    else lifeEvents.push({ ...event, year, amountCents: restate(event.amountCents) })
  })
  const carried: CarriedEvent[] = oldStart
    ? events.map((event, i) => {
        const year = years[i] ?? null
        return { event, from: anniversary(oldStart, event.year), to: year === null ? null : anniversary(date, year) }
      })
    : []
  return { lifeEvents, droppedLifeEvents, carried }
}

/**
 * The purchase year on the new start, and its old and new date. A purchase now on or behind the start
 * is a house owned from day one, which is year 0, and a house owned from day one stays so, whichever
 * way the date moves.
 */
function carryPurchase(
  purchase: number | null,
  oldStart: string | null,
  date: string,
): { housePurchaseYear: number | null; house: Rebaseline['house'] } {
  const housePurchaseYear =
    purchase === null || purchase === 0 || !oldStart ? purchase : (carriedYear(purchase, oldStart, date, date) ?? 0)
  const house =
    oldStart && purchase !== null && purchase > 0 && housePurchaseYear !== null
      ? {
          from: anniversary(oldStart, purchase),
          to: housePurchaseYear > 0 ? anniversary(date, housePurchaseYear) : null,
        }
      : null
  return { housePurchaseYear, house }
}

export function rebaseline(
  scenario: Rebaselinable,
  latest: { investedCents: number; date: string },
  inflationRate: number,
): Rebaseline {
  // A start that is not a day on the calendar (only an API could have written one) reads as none.
  const oldStart = scenario.planStartDate && isCalendarDate(scenario.planStartDate) ? scenario.planStartDate : null
  const moved = yearsMoved(oldStart, latest.date)
  // The euros of the new start: what was typed in the euros of the old one, by the inflation between.
  const factor = Math.pow(1 + inflationRate, moved)
  const restate = (cents: number) => Math.round(cents * factor)
  const { lifeEvents, droppedLifeEvents, carried } = carryEvents(scenario.lifeEvents, oldStart, latest.date, restate)
  const { housePurchaseYear, house } = carryPurchase(scenario.housePurchaseYear, oldStart, latest.date)
  const { monthlyContributionCents, contributionSchedule, droppedSteps } = restartContribution(
    scenario,
    oldStart,
    latest.date,
  )
  const { fields: houseFields, priceMoved, owned } = restartHouse(scenario, oldStart, latest.date, inflationRate)
  const spend = restate(scenario.annualSpendCents)
  const rent = restate(scenario.rentMonthlyCents)
  const fees = restate(scenario.transactionCostsCents)
  return {
    patch: {
      startInvestedCents: latest.investedCents,
      planStartDate: latest.date,
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

/** What happened to the monthly amount, or null when it did not move. */
function monthlyLine(r: Rebaseline, format: MoneyFormat, formatDate: (iso: string) => string): string | null {
  if (r.droppedSteps.length === 0) return null
  const from = formatCents(r.previous.monthlyContributionCents, format)
  const to = formatCents(r.patch.monthlyContributionCents, format)
  const changes = r.droppedSteps
    .map((s) => `${formatCents(s.monthlyCents, format)} from ${formatDate(`${s.from}-01`)}`)
    .join(', then ')
  const one = r.droppedSteps.length === 1
  return `Monthly investing goes from ${from} to ${to}: the change to ${changes} ${one ? 'is' : 'are'} already behind the new start, so ${one ? 'it is' : 'they are'} in the monthly amount.`
}

/** "3 years", "2,5 years", "1 year": a whole number of years is said plainly, a part year to one decimal. */
function yearsText(years: number, format: MoneyFormat): string {
  const rounded = Math.round(years * 10) / 10
  const text = rounded.toLocaleString(format.locale, { maximumFractionDigits: 1 })
  return rounded === 1 ? '1 year' : `${text} years`
}

/** What was counted in the euros of the new start, and the price of a house still to buy. */
function restatedLines(r: Rebaseline, format: MoneyFormat): string[] {
  const lines: string[] = []
  const { restated, housePrice } = r
  if (restated) {
    const money = (pair: [number, number]) => `${formatCents(pair[0], format)} becomes ${formatCents(pair[1], format)}`
    lines.push(
      `After ${yearsText(restated.years, format)} at ${formatPercent(restated.inflationRate, format)} inflation, the amounts typed in the ${currencyWord(format)} of the old start are counted in the ${currencyWord(format)} of the new one: spending ${money(restated.spend)}, rent ${money(restated.rent)}, fees ${money(restated.fees)}, and event amounts the same way.`,
    )
  }
  if (housePrice) {
    const years = restated ? yearsText(restated.years, format) : 'the years since the old start'
    lines.push(
      `The house price ${formatCents(housePrice.from, format)} becomes ${formatCents(housePrice.to, format)}: houses rose ${formatPercent(housePrice.appreciation, format)} a year over those ${years}.`,
    )
  }
  return lines
}

/**
 * A house already bought is held as owned from day one, worth what it is worth now, with what the
 * loan's own schedule says is still owed. That owed amount is an assumption, not a balance read from
 * anywhere, so it is said, and so is how to undo a purchase that has not happened.
 */
function ownedHouseLine(r: Rebaseline, format: MoneyFormat, formatDate: (iso: string) => string): string {
  const owned = r.ownedHouse!
  const behind = r.house
    ? `The house purchase (${formatDate(r.house.from)}) is behind the new start, so the plan holds the house as owned from day one`
    : 'The plan holds the house as owned from day one'
  const left = owned.owedCents === 0 ? 'with nothing owed' : `with about ${formatCents(owned.owedCents, format)} still owed over ${yearsText(owned.remainingYears, format)}`
  const note = owned.raisedToOwed ? ' It owes more than it is worth on these figures, so its value is set to what is owed.' : ''
  const unsure = r.house ? ' If you have not bought it yet, cancel, move the purchase year, then re-baseline.' : ''
  return `${behind}: worth about ${formatCents(owned.valueCents, format)}, ${left} (the loan's own schedule, not a balance you logged).${note}${unsure}`
}

/**
 * What the re-baseline changes besides the start, one line each, for the editor's note and
 * the Progress confirm sheet: empty when nothing but the start changed. Life events keep
 * their calendar dates as far as whole plan years allow, so a later one can land on the
 * next anniversary of the new start, and the dates say by how much.
 */
export function rebaselineSummary(
  r: Rebaseline,
  format: MoneyFormat,
  formatDate: (iso: string) => string,
): string[] {
  const name = (e: LifeEvent) => e.label || formatCents(e.amountCents, format)
  const lines: string[] = []
  const monthly = monthlyLine(r, format, formatDate)
  if (monthly) lines.push(monthly)
  lines.push(...restatedLines(r, format))
  const moved = r.carried.filter((c) => c.to !== null && c.to !== c.from)
  for (const c of moved) {
    lines.push(`${name(c.event)} moves from ${formatDate(c.from)} to ${formatDate(c.to!)}.`)
  }
  if (r.ownedHouse) {
    lines.push(ownedHouseLine(r, format, formatDate))
  } else if (r.house && r.house.to !== null && r.house.to !== r.house.from) {
    lines.push(`The house purchase moves from ${formatDate(r.house.from)} to ${formatDate(r.house.to)}.`)
  }
  if (moved.length > 0 || (r.house?.to != null && r.house.to !== r.house.from)) {
    lines.push('Plan years are whole, so a later date lands on the next anniversary of the new start.')
  }
  for (const c of r.carried.filter((x) => x.to === null)) {
    lines.push(`${name(c.event)} (${formatDate(c.from)}) is already in the balance, so it is dropped.`)
  }
  return lines
}
