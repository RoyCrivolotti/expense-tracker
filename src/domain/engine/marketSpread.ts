/**
 * How far luck could move the plan: the plan's own year, replayed with random returns. The entered return is
 * the TYPICAL growth, the one the middle of the replays compounds at, and each year's growth is that times
 * `e^(spread x z)` with `z` a standard normal, so the mean is higher than the typical growth by about half the
 * spread squared. Only the returns are random: the saving, the house payment, the events and the inflation are
 * the plan's. At no spread every run is the plan, to the cent.
 *
 * The draws are fixed (one seed, one stride per year), so an edit moves the picture instead of redrawing it, and
 * half the runs are the mirror image of the other half, which keeps the middle of the replays on the typical
 * path. Runs are taken a year at a time, so only the runs of that year are held, not all years of all of them.
 */
import { DRAW_SEED, DRAW_YEARS, normalDraws } from './rng'
import { stepInvested, yearFlows } from './investedStep'
import type { ProjectionParams } from './projection'

/** The most years a replay covers, whatever the plan's horizon is. */
export const SPREAD_MAX_YEARS = 60
/** The one seed, so the same plan is the same picture. */
export const SPREAD_SEED = DRAW_SEED
const PERCENTILES = [10, 25, 50, 75, 90] as const
/** A run that has not crossed yet. */
const NOT_YET = 255

export interface Bands {
  p10: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p90: number[]
}

/** The years at which the runs first reach an amount, at each rank, as the year at that rank among all the runs. */
export interface CrossingRange {
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  /** The share of runs that get there within the years, 0 to 1. A rank above it is `Infinity`: not within them. */
  share: number
}

export interface SpreadInput {
  params: ProjectionParams
  /** The spread of a year's return: 0,15 is a typical year landing between about 0,86 and 1,16 of the typical growth. */
  volatility: number
  /** An even number: every run has a mirror image. An odd one is rounded up. */
  runs: number
  /** Amounts on the account, in screen euros, to find the first year each is reached. */
  milestonesCents?: readonly number[]
  /** The FI target, in the plan's money; null for none. */
  fiTargetCents?: number | null
  seed?: number
}

export interface SpreadResult {
  years: number
  runs: number
  /** The portfolio at the end of each year, after a house payment and events, at each rank. */
  after: Bands
  /** The portfolio the day before the year's house payment and events, at each rank: what the line rises to. */
  before: Bands
  /** The share of runs below nothing at the end of each year. */
  belowZero: number[]
  milestones: CrossingRange[]
  fi: CrossingRange | null
}

/**
 * A year's growth. A portfolio in credit earns the typical growth times the market's luck; one that is below
 * nothing (a house paid for with more than the portfolio had) is a debt, which no market makes bigger or smaller,
 * so it grows at the plain return as the plan has it.
 */
export function growthFor(prev: number, realReturn: number, volatility: number, draw: number): number {
  return prev < 0 ? 1 + realReturn : (1 + realReturn) * Math.exp(volatility * draw)
}

/** The value at a percentile of sorted values, interpolating between the two nearest. */
export function percentile(sorted: Float64Array, p: number): number {
  const at = ((sorted.length - 1) * p) / 100
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return sorted[lo]! + (at - lo) * (sorted[hi]! - sorted[lo]!)
}

/**
 * The year at each rank among all the runs, nearest-rank: the year in which the run at that rank first reaches
 * it, or `Infinity` when that rank is among the runs that never do. `byYear[y]` is how many first reach it in
 * year `y`; the rest of the `runs` never do. Nearest-rank, not interpolated: a year between two years is not a
 * year, and an interpolation towards "never" is not a number.
 */
export function crossingRange(byYear: readonly number[], never: number): CrossingRange {
  const runs = byYear.reduce((s, c) => s + c, 0) + never
  const at = (p: number): number => {
    const rank = Math.ceil((p / 100) * runs)
    let seen = 0
    for (let year = 0; year < byYear.length; year++) {
      seen += byYear[year]!
      if (seen >= rank) return year
    }
    return Infinity
  }
  const [p10, p25, p50, p75, p90] = PERCENTILES.map(at) as [number, number, number, number, number]
  return { p10, p25, p50, p75, p90, share: runs === 0 ? 0 : (runs - never) / runs }
}

function emptyBands(): Bands {
  return { p10: [], p25: [], p50: [], p75: [], p90: [] }
}

function pushBands(bands: Bands, values: Float64Array, buffer: Float64Array): void {
  buffer.set(values)
  buffer.sort()
  bands.p10.push(percentile(buffer, 10))
  bands.p25.push(percentile(buffer, 25))
  bands.p50.push(percentile(buffer, 50))
  bands.p75.push(percentile(buffer, 75))
  bands.p90.push(percentile(buffer, 90))
}

/** Tracks the first year each run reaches one amount, at the plan's value before the events or after them. */
class Crossing {
  readonly first: Uint8Array
  private left: number
  private readonly needed: (year: number) => number

  constructor(runs: number, needed: (year: number) => number) {
    this.first = new Uint8Array(runs).fill(NOT_YET)
    this.left = runs
    this.needed = needed
  }

  see(year: number, before: Float64Array, after: Float64Array): void {
    if (this.left === 0) return
    const bar = this.needed(year)
    for (let run = 0; run < before.length; run++) {
      if (this.first[run] === NOT_YET && (before[run]! >= bar || after[run]! >= bar)) {
        this.first[run] = year
        this.left -= 1
      }
    }
  }

  range(years: number): CrossingRange {
    const byYear = new Array<number>(years + 1).fill(0)
    let never = 0
    for (const year of this.first) {
      if (year === NOT_YET) never += 1
      else byYear[year] = (byYear[year] ?? 0) + 1
    }
    return crossingRange(byYear, never)
  }
}

/** Everything a year of the replay reads and writes: the runs, the draws, and what each year adds and takes. */
interface Replay {
  pairs: number
  runs: number
  draws: Float64Array
  flows: ReturnType<typeof yearFlows>[]
  realReturn: number
  volatility: number
  /** Each run's portfolio at the end of the year, and the day before the year's house payment and events. */
  balance: Float64Array
  pre: Float64Array
}

/** One year on for every run: its growth (the mirror runs take the opposite draw), then the year's saving and events. */
function advance(replay: Replay, year: number): void {
  const { pairs, runs, draws, balance, pre } = replay
  for (let run = 0; run < runs; run++) {
    const draw = draws[(year - 1) * pairs + (run >> 1)]! * (run & 1 ? -1 : 1)
    const growth = growthFor(balance[run]!, replay.realReturn, replay.volatility, draw)
    const step = stepInvested(balance[run]!, growth, replay.flows[year]!)
    pre[run] = step.pre
    balance[run] = step.post
  }
}

function shareBelowZero(balance: Float64Array): number {
  let short = 0
  for (const value of balance) if (value < 0) short += 1
  return short / balance.length
}

function startReplay(input: SpreadInput, years: number): Replay {
  const { params } = input
  const pairs = Math.max(1, Math.ceil(input.runs / 2))
  const runs = pairs * 2
  return {
    pairs,
    runs,
    draws: normalDraws(pairs, DRAW_YEARS, input.seed ?? SPREAD_SEED),
    // What each year adds and takes is the plan's, the same for every run, so it is worked out once.
    flows: Array.from({ length: years + 1 }, (_, year) => yearFlows(params, year)),
    realReturn: params.expectedRealReturn,
    volatility: input.volatility,
    balance: new Float64Array(runs).fill(params.startInvestedCents),
    pre: new Float64Array(runs).fill(params.startInvestedCents),
  }
}

export function replayMarket(input: SpreadInput): SpreadResult {
  const { params } = input
  const years = Math.min(params.horizonYears, SPREAD_MAX_YEARS)
  const replay = startReplay(input, years)
  // An amount on the account is worth less in the plan's money the later it is reached: `v x (1 + i)^t >= A`.
  const grown = Array.from({ length: years + 1 }, (_, year) => Math.pow(1 + params.inflationRate, year))
  const targets = (input.milestonesCents ?? []).map((amount) => new Crossing(replay.runs, (year) => amount / grown[year]!))
  const fiTarget = input.fiTargetCents
  const fi = typeof fiTarget === 'number' ? new Crossing(replay.runs, () => fiTarget) : null

  const after = emptyBands()
  const before = emptyBands()
  const belowZero: number[] = []
  const buffer = new Float64Array(replay.runs)
  for (let year = 0; year <= years; year++) {
    if (year > 0) advance(replay, year)
    pushBands(before, replay.pre, buffer)
    pushBands(after, replay.balance, buffer)
    belowZero.push(shareBelowZero(replay.balance))
    for (const target of targets) target.see(year, replay.pre, replay.balance)
    // The FI year is the plan's invested portfolio at the end of the year, events included.
    fi?.see(year, replay.balance, replay.balance)
  }

  return { years, runs: replay.runs, after, before, belowZero, milestones: targets.map((t) => t.range(years)), fi: fi?.range(years) ?? null }
}
