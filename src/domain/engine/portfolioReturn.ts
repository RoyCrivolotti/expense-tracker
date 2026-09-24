/**
 * What the invested portfolio actually returned between the first and the latest
 * check-in, with the money that went in or came out along the way taken out of the
 * picture.
 *
 * Linked Modified Dietz. Each stretch between two consecutive check-ins gets its own
 * return: the gain is end minus start minus the net flows, divided by the start plus each
 * flow weighted by how long it was in. The stretches are then chained, so the result is
 * the growth of one unit left in from the first check-in to the last, whatever was added
 * or taken out in between. That is a time-weighted return, the same kind of figure a
 * plan's expected return is, and it gets closer to the true one the more often check-ins
 * are logged, because a check-in is where the balance is actually known.
 *
 * Flows are investment transactions dated inside a stretch: positive going in, negative
 * coming back out (a sale to cash, a dividend paid out). A check-in records balances, so
 * a balance rise is either return or a flow, never both.
 */
import type { Transaction, WealthAccount, WealthCheckin } from '../types'
import { DAY_MS, utcDateMs } from './dates'
import { checkinInvestedCents } from './wealthTracking'

const YEAR_DAYS = 365.25

export interface PortfolioReturn {
  /** Return over the whole period, as a fraction. */
  periodReturn: number
  /** Compounded to a yearly rate, only once a full year is in; shorter periods mislead. */
  annualised: number | null
  startDate: string
  endDate: string
  years: number
  /** Net flows over the period: contributions less withdrawals. */
  contributionsCents: number
  /** How many stretches between check-ins were chained, empty ones left out. */
  periods: number
}

function isFlow(t: Transaction): boolean {
  return t.type === 'investment' && t.status !== 'cancelled' && t.status !== 'forecast'
}

/**
 * The return of one stretch. Null when there was nothing in it to earn on and yet the
 * balance moved; 'empty' when it starts and ends at nothing with nothing moved, which is
 * a portfolio that has not opened yet rather than a failure.
 */
function stretchReturn(
  start: WealthCheckin,
  end: WealthCheckin,
  accounts: WealthAccount[],
  flows: Transaction[],
): { rate: number; flowCents: number } | 'empty' | null {
  const startMs = utcDateMs(start.checkinDate)
  const endMs = utcDateMs(end.checkinDate)
  const days = (endMs - startMs) / DAY_MS
  const startCents = checkinInvestedCents(start, accounts)
  const endCents = checkinInvestedCents(end, accounts)
  let flowCents = 0
  let weightedCents = 0
  for (const t of flows) {
    // A check-in is the balance at the end of its day, so a flow dated the first day is
    // already inside the start balance and one dated the last day is inside the end balance
    // (counted, with no time invested). Moving the first-day flow into the stretch instead
    // would count it twice.
    if (t.date <= start.checkinDate || t.date > end.checkinDate) continue
    flowCents += t.amountCents
    weightedCents += days > 0 ? t.amountCents * ((endMs - utcDateMs(t.date)) / DAY_MS / days) : 0
  }
  const base = startCents + weightedCents
  if (base <= 0) {
    return startCents === 0 && endCents === 0 && flowCents === 0 ? 'empty' : null
  }
  return { rate: (endCents - startCents - flowCents) / base, flowCents }
}

/**
 * Null until two check-ins at least thirty days apart exist, when nothing was ever
 * invested, or when a stretch had nothing invested to earn on while its balance still
 * moved, which means money arrived that no transaction accounts for.
 */
export function portfolioReturn(
  checkins: WealthCheckin[],
  accounts: WealthAccount[],
  transactions: Transaction[],
): PortfolioReturn | null {
  if (checkins.length < 2) return null
  const sorted = [...checkins].sort((a, b) => a.checkinDate.localeCompare(b.checkinDate))
  const flows = transactions.filter(isFlow)
  let growth = 1
  let contributionsCents = 0
  let periods = 0
  // The period runs from the first check-in with money in, so the empty months before
  // the portfolio opened neither count as time nor water down the yearly rate.
  let first: WealthCheckin | null = null
  for (let i = 1; i < sorted.length; i++) {
    const start = sorted[i - 1]!
    const stretch = stretchReturn(start, sorted[i]!, accounts, flows)
    if (stretch === null) return null
    if (stretch === 'empty') continue
    first ??= start
    growth *= 1 + stretch.rate
    contributionsCents += stretch.flowCents
    periods += 1
  }
  if (!first) return null
  const last = sorted[sorted.length - 1]!
  const days = (utcDateMs(last.checkinDate) - utcDateMs(first.checkinDate)) / DAY_MS
  if (days < 30) return null

  const periodReturn = growth - 1
  const years = days / YEAR_DAYS
  // A calendar year is 365 days, which is a hair under a year of 365.25.
  const annualised = days >= 365 ? Math.pow(1 + periodReturn, 1 / years) - 1 : null
  return {
    periodReturn,
    annualised,
    startDate: first.checkinDate,
    endDate: last.checkinDate,
    years,
    contributionsCents,
    periods,
  }
}
