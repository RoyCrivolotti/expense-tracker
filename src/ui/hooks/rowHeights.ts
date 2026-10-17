import type { TransactionListRow } from '../../engine'

/** What the windowed list believes a row, a day header and the space between days are until it has seen one. */
const DEFAULT_ROW_PX = 62
const DEFAULT_HEADER_PX = 28
const DEFAULT_GAP_PX = 16
/** A row with labels carries a line of chips more than one without. */
const LABEL_LINE_PX = 22
/** Smaller differences are layout rounding, and not worth re-laying-out the list for. */
const CHANGE_PX = 0.5

const STATEMENT_SHAPE = 9
const MAX_LABEL_SHAPE = 3

/**
 * Rows of one shape are the same height bar the odd chip row that wraps, so a row that has not
 * been on screen yet is assumed to be as tall as the ones that have. The closer that is, the
 * less the list has to shift when a row above the screen turns out different.
 */
export function rowShape(row: TransactionListRow): number {
  if (row.kind === 'statement-payment') return STATEMENT_SHAPE
  return Math.min(row.txn.labelIds?.length ?? 0, MAX_LABEL_SHAPE)
}

/** Unique within one list; a statement's key has a colon in it, an id does not. */
export function rowKey(row: TransactionListRow): string {
  return row.kind === 'transaction' ? String(row.txn.id) : row.key
}

export interface Sample {
  key: string
  shape: number
  height: number
}

/** What a store starts out believing, in place of the defaults. */
export interface Seed {
  means: ReadonlyMap<number, number>
  header: number
  gap: number
}

/** The heights seen so far, as a store React can subscribe to: a new reading that matters bumps `version`. */
export interface RowHeights {
  subscribe: (listener: () => void) => () => void
  version: () => number
  height: (key: string, shape: number) => number
  header: () => number
  gap: () => number
  record: (samples: readonly Sample[]) => void
  setChrome: (header: number, gap: number) => void
  /** What it has learned about rows of each shape, to start another store from. */
  seed: () => Seed
}

interface Total {
  sum: number
  count: number
}

/**
 * A new store knows no row by name, since what was measured under one layout does not hold for
 * the next, but rows of a shape are near enough alike across layouts that a `seed` from the last
 * store is a better first guess than the defaults. Starting from the defaults would, for one
 * render, move every row above the screen by the difference.
 */
export function createRowHeights(seed?: Seed): RowHeights {
  const measured = new Map<string, number>()
  const totals = new Map<number, Total>()
  const listeners = new Set<() => void>()
  let version = 0
  let header = seed?.header ?? DEFAULT_HEADER_PX
  let gap = seed?.gap ?? DEFAULT_GAP_PX

  const bump = () => {
    version += 1
    for (const listener of listeners) listener()
  }
  const mean = (shape: number): number | undefined => {
    const total = totals.get(shape)
    return total ? total.sum / total.count : seed?.means.get(shape)
  }
  const estimate = (shape: number): number => {
    const own = mean(shape)
    if (own !== undefined) return own
    const plain = mean(0) ?? DEFAULT_ROW_PX
    return shape >= 1 && shape <= MAX_LABEL_SHAPE ? plain + LABEL_LINE_PX : plain
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    version: () => version,
    height: (key, shape) => measured.get(key) ?? estimate(shape),
    header: () => header,
    gap: () => gap,
    record(samples) {
      let changed = false
      for (const { key, shape, height } of samples) {
        if (!(height > 0)) continue
        const before = measured.get(key)
        if (before !== undefined && Math.abs(before - height) < CHANGE_PX) continue
        if (Math.abs((before ?? estimate(shape)) - height) >= CHANGE_PX) changed = true
        measured.set(key, height)
        const total = totals.get(shape) ?? { sum: 0, count: 0 }
        total.sum += height - (before ?? 0)
        if (before === undefined) total.count += 1
        totals.set(shape, total)
      }
      if (changed) bump()
    },
    seed() {
      const means = new Map(seed?.means)
      for (const [shape, total] of totals) means.set(shape, total.sum / total.count)
      return { means, header, gap }
    },
    setChrome(nextHeader, nextGap) {
      if (Math.abs(nextHeader - header) < CHANGE_PX && Math.abs(nextGap - gap) < CHANGE_PX) return
      header = nextHeader
      gap = nextGap
      bump()
    },
  }
}
