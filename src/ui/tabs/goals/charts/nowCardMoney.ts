import { nominalToReal } from '../../../../engine'
import { aboutOnAccount, bothMoneys } from '../bothMoneys'
import { planMoneyLabel } from '../planMoneyLabel'
import type { InvestedSnapshot } from '../checkinDate'

/**
 * What the balance of the latest check-in is worth in the plan's euros, which is the money the FI target is in.
 * Nothing before a check-in (the plan start is already in them) or when there is no start date to count from,
 * and nothing when the two read the same.
 */
export function worthInPlanMoneyNote({
  latest,
  planStartDate,
  inflationRate,
  money,
}: {
  latest: InvestedSnapshot | null
  planStartDate: string | null | undefined
  inflationRate: number
  money: (cents: number) => string
}): string | null {
  if (!latest || !planStartDate) return null
  const real = money(nominalToReal(latest.investedCents, planStartDate, latest.date, inflationRate))
  if (real === money(latest.investedCents)) return null
  return `worth about ${real} in ${planMoneyLabel(planStartDate)}, the money the FI target is in`
}

/**
 * The FI target is in the plan's euros; this says what it comes to on the account where the plan reaches it,
 * or at the end of the plan when it never does.
 */
export function fiTargetMoneyNote({
  targetCents,
  fiYear,
  horizonYears,
  planStartDate,
  inflationRate,
  money,
}: {
  targetCents: number
  fiYear: number | null
  horizonYears: number
  planStartDate: string | null | undefined
  inflationRate: number
  money: (cents: number) => string
}): string {
  const target = bothMoneys({ cents: targetCents, years: fiYear ?? horizonYears, planStartDate, inflationRate, money })
  const when = fiYear != null ? ', the year the plan reaches it' : ', when the plan ends'
  return `The target is in ${target.planLabel}, ${aboutOnAccount(target)}${when}.`
}
