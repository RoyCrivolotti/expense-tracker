/**
 * What the invested portfolio actually returned between the first and the latest
 * check-in, with the money that went in along the way taken out of the picture.
 *
 * Modified Dietz: the gain is end minus start minus contributions, divided by the start
 * plus each contribution weighted by how long it was in. No solver, and it agrees with a
 * true money-weighted return for the modest flows a household makes. Contributions are
 * investment transactions dated inside the period; a check-in records balances, so a
 * balance rise is either return or a contribution, never both.
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
  contributionsCents: number
}

/** Null until two check-ins at least thirty days apart exist, or when nothing was invested. */
export function portfolioReturn(
  checkins: WealthCheckin[],
  accounts: WealthAccount[],
  transactions: Transaction[],
): PortfolioReturn | null {
  if (checkins.length < 2) return null
  const sorted = [...checkins].sort((a, b) => a.checkinDate.localeCompare(b.checkinDate))
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const startMs = utcDateMs(first.checkinDate)
  const endMs = utcDateMs(last.checkinDate)
  const days = (endMs - startMs) / DAY_MS
  if (days < 30) return null

  const startCents = checkinInvestedCents(first, accounts)
  const endCents = checkinInvestedCents(last, accounts)
  let contributionsCents = 0
  let weightedCents = 0
  for (const t of transactions) {
    if (t.type !== 'investment' || t.status === 'cancelled' || t.status === 'forecast') continue
    // A check-in is the balance at the end of its day, so a flow dated the first day is
    // already inside the start balance and one dated the last day is inside the end balance
    // (counted, with no time invested). Moving the first-day flow into the period instead
    // would count it twice.
    if (t.date <= first.checkinDate || t.date > last.checkinDate) continue
    contributionsCents += t.amountCents
    weightedCents += t.amountCents * ((endMs - utcDateMs(t.date)) / DAY_MS / days)
  }
  const base = startCents + weightedCents
  if (base <= 0) return null

  const periodReturn = (endCents - startCents - contributionsCents) / base
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
  }
}
