/**
 * Sends the seed statements one at a time, charging each to the spend ledger before the next. The first
 * chunk of transactions is small on purpose: if D1 reports more rows written for it than the plan assumed,
 * the run stops there, having spent about a hundred and sixty rows, instead of finding out at the end.
 */
import type { SeedStep } from './seedSql'
import type { SpendLedger } from './spend'
import type { Transport } from './transport'

/** How far above the plan the first chunk of transactions may land before the run stops. */
export const CALIBRATION_TOLERANCE = 0.25

export interface SeedResult {
  statements: number
  rowsWritten: number
  /** Rows D1 reported written for the calibration chunk against what the plan expected. */
  calibration?: { actual: number; expected: number }
}

export class PlanWrong extends Error {}

export async function runSeed(
  transport: Transport,
  steps: SeedStep[],
  ledger: SpendLedger,
  shouldStop: () => boolean = () => false,
): Promise<SeedResult> {
  const result: SeedResult = { statements: 0, rowsWritten: 0 }
  let calibrated = false
  for (const step of steps) {
    if (shouldStop()) throw new Error('Stopped: the stop file is present')
    ledger.assertWithin(step.expectedWritten ?? step.rows * 2)
    const reply = await transport.query(step.statement)
    ledger.record(reply.meta)
    result.statements += 1
    result.rowsWritten += reply.meta.rows_written ?? 0
    if (step.table === 'transactions' && !calibrated && step.expectedWritten) {
      calibrated = true
      const actual = reply.meta.rows_written ?? 0
      result.calibration = { actual, expected: step.expectedWritten }
      if (actual > step.expectedWritten * (1 + CALIBRATION_TOLERANCE)) {
        throw new PlanWrong(
          `the first ${step.rows} transactions wrote ${actual} rows, the plan expected ${step.expectedWritten}; recompute the plan before going on`,
        )
      }
    }
  }
  return result
}
