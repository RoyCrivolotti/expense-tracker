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
import { checkinInvestedCents } from './wealthTracking'

const DAY_MS = 86_400_000
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

function utcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
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
  const startMs = utcMs(first.checkinDate)
  const endMs = utcMs(last.checkinDate)
  const days = (endMs - startMs) / DAY_MS
  if (days < 30) return null

  const startCents = checkinInvestedCents(first, accounts)
  const endCents = checkinInvestedCents(last, accounts)
  let contributionsCents = 0
  let weightedCents = 0
  for (const t of transactions) {
    if (t.type !== 'investment' || t.status === 'cancelled' || t.status === 'forecast') continue
    if (t.date <= first.checkinDate || t.date > last.checkinDate) continue
    contributionsCents += t.amountCents
    weightedCents += t.amountCents * ((endMs - utcMs(t.date)) / DAY_MS / days)
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
