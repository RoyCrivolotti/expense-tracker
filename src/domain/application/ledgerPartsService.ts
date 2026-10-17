import {
  MAX_CUBE_CELLS,
  MAX_CUBE_MONTHS,
  MAX_ROWS_MONTHS,
  MAX_ROWS_PER_REQUEST,
  type MonthRange,
  type MonthRowsRead,
} from '../data/ledgerParts'
import { monthsBetweenBudget } from '../engine/dates'
import type { MonthCell } from '../ledger/types'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { ValidationError } from './validationError'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

function monthOf(value: unknown, key: string): string {
  if (value === undefined) throw new ValidationError(`${key} is required, as YYYY-MM`)
  if (typeof value !== 'string' || !MONTH.test(value)) throw new ValidationError(`${key} must be YYYY-MM`)
  return value
}

/** Both ends, inclusive, and no more than `maxMonths` months between them. */
export function validateMonthRange(input: { from?: unknown; to?: unknown }, maxMonths: number): MonthRange {
  const from = monthOf(input.from, 'from')
  const to = monthOf(input.to, 'to')
  const span = monthsBetweenBudget(from, to) + 1
  if (span < 1) throw new ValidationError('to must not be before from')
  if (span > maxMonths) {
    throw new ValidationError(`The range spans ${span} months and at most ${maxMonths} are served at once`)
  }
  return { from, to }
}

/** The range a rows request may ask for. */
export const rowsRange = (input: { from?: unknown; to?: unknown }): MonthRange =>
  validateMonthRange(input, MAX_ROWS_MONTHS)

/** The range a cube request may ask for. */
export const cubeRange = (input: { from?: unknown; to?: unknown }): MonthRange =>
  validateMonthRange(input, MAX_CUBE_MONTHS)

export type MonthRowsResult = MonthRange & MonthRowsRead
export type MonthCubeResult = MonthRange & { cells: MonthCell[] }

/**
 * Every row of a range of budget months. A range with more than {@link MAX_ROWS_PER_REQUEST} rows is
 * refused, not cut short: a client given part of a month would add up the wrong total.
 */
export async function readMonthRows(
  repo: ExpenseRepository,
  owner: string,
  range: MonthRange,
): Promise<MonthRowsResult> {
  const read = await repo.readMonthRows(owner, range, MAX_ROWS_PER_REQUEST)
  if (read === null) {
    throw new ValidationError(
      `The range holds more than ${MAX_ROWS_PER_REQUEST} rows; ask for fewer months, or read a single month with the paged list`,
    )
  }
  return { ...range, ...read }
}

/** The per-month sums of the unpinned rows of a range; see `buildCells` for what a cell is. */
export async function readMonthCube(
  repo: ExpenseRepository,
  owner: string,
  range: MonthRange,
): Promise<MonthCubeResult> {
  const cells = await repo.readMonthCells(owner, range, MAX_CUBE_CELLS)
  if (cells === null) {
    throw new ValidationError(`The range holds more than ${MAX_CUBE_CELLS} cells; ask for fewer months`)
  }
  return { ...range, cells }
}
