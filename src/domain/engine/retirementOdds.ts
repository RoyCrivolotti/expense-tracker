/**
 * The chance that the money lasts: a retirement started at a given portfolio, a constant withdrawal each year
 * (in the plan's euros, like the rest of the plan) and the same seeded markets the spread card replays, so
 * "the money lasts in 85 of 100 runs" and "the portfolio ends between 2043 and 2049" come from the same
 * futures. With no bounce a run is the plan's own drawdown (`projectDrawdown`), to the cent.
 */
import { DRAW_SEED, DRAW_YEARS, normalDraws } from './rng'

export interface RetirementOddsInput {
  /** The portfolio the retirement starts with, in the plan's euros. */
  startCents: number
  /** What is taken out each year, in the plan's euros. */
  annualWithdrawalCents: number
  /** The typical yearly growth after inflation; the middle of the runs compounds at it. */
  realReturn: number
  /** The yearly bounce of the market, as in the spread card. */
  volatility: number
  /** How many years the money has to last, from 1 to the 100 the draws cover. */
  years: number
  /** An even number: every run has a mirror image. An odd one is rounded up. */
  runs: number
  seed?: number
}

export interface RetirementOdds {
  runs: number
  years: number
  /** The share of runs, from 0 to 1, in which every year's withdrawal was paid in full. */
  lasts: number
  /**
   * How many years of withdrawals one run in ten paid in full or fewer (all of them when 90% last): the cut-off of
   * the unluckiest tenth, not what that tenth got, which is less on average.
   */
  unluckiestTenth: number
}

/**
 * Replays a retirement in `runs` different markets. Each year the balance grows by `(1 + return) x e^(bounce x z)`
 * and the withdrawal comes out, rounded to the cent as the plan's own drawdown is; a run is short in the first
 * year the balance goes below nothing, and has lasted the years before it. Years are one pass over every run
 * so the draws are read in order.
 */
export function replayRetirement(input: RetirementOddsInput): RetirementOdds {
  const years = Math.min(DRAW_YEARS, Math.max(1, Math.round(input.years)))
  const pairs = Math.max(1, Math.ceil(input.runs / 2))
  const runs = pairs * 2
  const draws = normalDraws(pairs, DRAW_YEARS, input.seed ?? DRAW_SEED)
  const balance = new Float64Array(runs).fill(input.startCents)
  // A run that is still paying has `years` here; a run that came up short has the years it did pay.
  const lasted = new Uint8Array(runs).fill(years)
  const typical = 1 + input.realReturn
  for (let year = 1; year <= years; year++) {
    const base = (year - 1) * pairs
    for (let run = 0; run < runs; run++) {
      if (lasted[run] !== years) continue
      const draw = draws[base + (run >> 1)]! * (run & 1 ? -1 : 1)
      const next = Math.round(balance[run]! * (typical * Math.exp(input.volatility * draw)) - input.annualWithdrawalCents)
      if (next < 0) lasted[run] = year - 1
      else balance[run] = next
    }
  }
  const counts = new Uint32Array(years + 1)
  for (let run = 0; run < runs; run++) counts[lasted[run]!]!++
  const rank = Math.ceil(runs / 10)
  let seen = 0
  let unluckiestTenth = years
  for (let y = 0; y <= years; y++) {
    seen += counts[y]!
    if (seen >= rank) {
      unluckiestTenth = y
      break
    }
  }
  return { runs, years, lasts: counts[years]! / runs, unluckiestTenth }
}
