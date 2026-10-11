import type { GapSplit } from '../../../engine'
import { wholeEuros } from '../../../engine'

export interface Row {
  key: string
  label: string
  /** Whole euros, signed. */
  euros: number
  muted?: boolean
}

function startLabel(split: GapSplit, euros: number): string {
  if (split.beforeFirstCheckin) return euros > 0 ? 'Ahead before your first check-in' : 'Behind before your first check-in'
  return euros > 0 ? 'You started ahead of the plan' : 'You started behind the plan'
}

function savingLabel(split: GapSplit, cents: number): string {
  if (Math.abs(cents) < split.plannedMonthCents) return 'Investing about as planned'
  return cents > 0 ? 'Investing more than planned' : 'Investing less than planned'
}

/** The parts as rows in whole euros that add up to the gap in whole euros, with the empty ones left out. */
export function gapRows(split: GapSplit): Row[] {
  const { parts, merged } = split
  const labelled: { key: string; label: string; cents: number; muted?: boolean }[] = [
    { key: 'start', label: startLabel(split, parts.start), cents: parts.start },
    merged
      ? { key: 'together', label: 'Your investing and the market together', cents: parts.saving + parts.market }
      : { key: 'saving', label: savingLabel(split, parts.saving), cents: parts.saving },
    ...(merged
      ? []
      : [{ key: 'market', label: parts.market >= 0 ? 'The market doing better than the plan assumes' : 'The market doing worse than the plan assumes', cents: parts.market }]),
    { key: 'timing', label: "The plan's line moves a year at a time (not something you did)", cents: parts.timing, muted: true },
  ]
  const euros = wholeEuros(labelled.map((r) => r.cents))
  return labelled
    .map((r, k) => ({ key: r.key, label: r.label, euros: euros[k]!, ...(r.muted ? { muted: true } : {}) }))
    .filter((r) => r.euros !== 0)
}
