import type { SpendingGroupRow } from '../../../engine'

export interface BulletModel {
  /** Paid share of the bar, as a 0–100 percentage of the scale. */
  paidPct: number
  /** Hatched unpaid share, stacked after the paid share. */
  unpaidPct: number
  /**
   * Where the budget sits when the spend has overflowed past it. Under budget
   * the track's end IS the budget, so there is nothing to mark and this is null.
   */
  budgetTickPct: number | null
  /** Where an even pace sits today, when the month is open. */
  paceTickPct: number | null
  state: 'ok' | 'warn' | 'over'
}

/** Geometry for a row's budget bullet; null without a budget (the sparkline shows instead). */
export function buildBulletModel(row: SpendingGroupRow): BulletModel | null {
  if (row.budgetCents === null || row.budgetCents <= 0) return null
  const current = Math.max(0, row.currentCents)
  const scale = Math.max(current, row.budgetCents)
  const unpaid = Math.min(row.unpaidCents, current)
  const pct = (cents: number) => (cents / scale) * 100
  const over = current > row.budgetCents
  const warn = !over && row.shouldBeTodayCents !== null && current > row.shouldBeTodayCents
  return {
    paidPct: pct(current - unpaid),
    unpaidPct: pct(unpaid),
    budgetTickPct: over ? pct(row.budgetCents) : null,
    paceTickPct:
      row.shouldBeTodayCents !== null && row.shouldBeTodayCents < scale
        ? pct(row.shouldBeTodayCents)
        : null,
    state: over ? 'over' : warn ? 'warn' : 'ok',
  }
}
