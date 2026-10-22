/**
 * The three things a ledger is read in, each with its own race guard. A write the user makes while a read
 * is on its way is newer than what the read will bring, and putting the read's answer in would show the
 * old value again. What was written decides what is dropped: a changed row does not make a new reference
 * unusable, nor the other way round, so one counter per resource replaces a single count of every write.
 */
import type { HeldLedger } from './ledgerHold'

export type Resource = 'reference' | 'rows' | 'cube'

export type Epochs = Readonly<Record<Resource, number>>

export const NO_EPOCHS: Epochs = { reference: 0, rows: 0, cube: 0 }

export function bump(epochs: Epochs, resources: readonly Resource[]): Epochs {
  const next = { ...epochs }
  for (const resource of resources) next[resource] += 1
  return next
}

/** Which resources a read that started at `started` may still replace, now that the epochs are `now`. */
export function stillCurrent(started: Epochs, now: Epochs): Record<Resource, boolean> {
  return {
    reference: started.reference === now.reference,
    rows: started.rows === now.rows,
    cube: started.cube === now.cube,
  }
}

/**
 * Puts what a full read brought into what is held, resource by resource. A resource written to since the
 * read started keeps its value. The revision is the read's only when every resource took it: otherwise
 * what is held is part this read and part later local writes, and no revision describes that.
 */
export function mergeRead(held: HeldLedger, read: HeldLedger, current: Record<Resource, boolean>): HeldLedger {
  let next = held
  if (current.reference) {
    next = {
      ...next,
      reference: read.reference,
      months: read.months,
      rowsPerMonth: read.rowsPerMonth,
      rowCount: read.rowCount,
      attachmentCounts: read.attachmentCounts,
    }
  }
  if (current.rows) next = { ...next, pinned: read.pinned, rows: read.rows }
  if (current.cube) next = { ...next, cells: read.cells }
  return { ...next, revision: current.reference && current.rows && current.cube ? read.revision : null }
}
