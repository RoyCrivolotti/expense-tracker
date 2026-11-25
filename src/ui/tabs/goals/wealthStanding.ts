import type { GoalScenario, Transaction, WealthAccount, WealthCheckin } from '../../../types'
import { splitGap, trackStatus, type GapReading, type TrackStatus } from '../../../engine'
import { behindFromTheMarket } from './gapRows'

/** Where the latest check-in stands against the plan, and where the gap to it comes from; neither without a plan to read against. */
export function readStanding(
  latest: WealthCheckin,
  checkins: WealthCheckin[],
  accounts: WealthAccount[],
  plan: GoalScenario | null,
  transactions: Transaction[],
  inflationRate: number,
): { status: TrackStatus | null; gap: GapReading | null } {
  const status = plan ? trackStatus(latest, plan, accounts, inflationRate) : null
  const gap = plan && status ? splitGap(plan, checkins, accounts, transactions, inflationRate) : null
  return { status, gap }
}

/** Whether the gap read is a split that puts the shortfall on the market and the plan's start. */
export function isBehindFromTheMarket(gap: GapReading | null): boolean {
  return gap?.kind === 'split' && behindFromTheMarket(gap)
}
