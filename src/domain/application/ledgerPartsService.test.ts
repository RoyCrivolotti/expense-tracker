import { describe, expect, it } from 'vitest'
import { MAX_CUBE_CELLS, MAX_CUBE_MONTHS, MAX_ROWS_MONTHS, MAX_ROWS_PER_REQUEST } from '../data/ledgerParts'
import { shiftBudgetMonth } from '../engine/dates'
import type { ExpenseRepository } from '../ports/expenseRepository'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import { makeTransaction } from '../../testing/factories'
import { cubeRange, readMonthCube, readMonthRows, rowsRange, validateMonthRange } from './ledgerPartsService'
import { ValidationError } from './validationError'

const OWNER = 'owner@example.com'

describe('validateMonthRange', () => {
  it('returns both ends of a range of one month or more', () => {
    expect(validateMonthRange({ from: '2026-03', to: '2026-03' }, 12)).toEqual({ from: '2026-03', to: '2026-03' })
    expect(validateMonthRange({ from: '2025-11', to: '2026-02' }, 12)).toEqual({ from: '2025-11', to: '2026-02' })
  })

  it.each([
    [{}, 'from is required'],
    [{ from: '2026-01' }, 'to is required'],
    [{ from: undefined, to: '2026-01' }, 'from is required'],
    [{ from: '2026-13', to: '2026-14' }, 'from must be YYYY-MM'],
    [{ from: '2026-01', to: '2026-1' }, 'to must be YYYY-MM'],
    [{ from: '2026-01-01', to: '2026-02' }, 'from must be YYYY-MM'],
    [{ from: 202601, to: '2026-02' }, 'from must be YYYY-MM'],
    [{ from: '2026-02', to: '2026-01' }, 'to must not be before from'],
  ])('refuses %j', (input, message) => {
    expect(() => validateMonthRange(input, 12)).toThrow(ValidationError)
    expect(() => validateMonthRange(input, 12)).toThrow(message)
  })

  it('counts both ends, so the most months is exactly allowed and one more is not', () => {
    expect(() => validateMonthRange({ from: '2026-01', to: '2026-12' }, 12)).not.toThrow()
    expect(() => validateMonthRange({ from: '2026-01', to: '2027-01' }, 12)).toThrow('spans 13 months and at most 12')
  })

  it('has its own limit for rows and for the cube', () => {
    const last = (from: string, months: number) => ({ from, to: shiftBudgetMonth(from, months - 1) })
    expect(() => rowsRange(last('2020-01', MAX_ROWS_MONTHS))).not.toThrow()
    expect(() => rowsRange(last('2020-01', MAX_ROWS_MONTHS + 1))).toThrow(ValidationError)
    expect(() => cubeRange(last('2000-01', MAX_CUBE_MONTHS))).not.toThrow()
    expect(() => cubeRange(last('2000-01', MAX_CUBE_MONTHS + 1))).toThrow(ValidationError)
  })
})

const rows = [
  makeTransaction({ id: 1, date: '2026-03-02', budgetMonth: '2026-03', accountId: 1 }),
  makeTransaction({ id: 2, date: '2026-04-02', budgetMonth: '2026-04', accountId: 1 }),
  makeTransaction({ id: 3, date: '2026-04-09', budgetMonth: '2026-04', accountId: 1, type: 'investment' }),
]

describe('readMonthRows and readMonthCube', () => {
  const repo = inMemoryExpenseRepository({ transactions: rows }, OWNER)

  it('answer with the range and what the repository read', async () => {
    const part = await readMonthRows(repo, OWNER, { from: '2026-04', to: '2026-05' })
    expect(part.from).toBe('2026-04')
    expect(part.to).toBe('2026-05')
    expect(part.transactions.map((t) => t.id)).toEqual([3, 2])
    const cube = await readMonthCube(repo, OWNER, { from: '2026-03', to: '2026-04' })
    expect(cube.cells.map((c) => [c.budgetMonth, c.count])).toEqual([['2026-03', 1], ['2026-04', 1]])
  })

  it('ask the repository for one more than the limit, so it can tell a range is too big', async () => {
    const asked: number[] = []
    const stub = {
      readMonthRows: (_owner: string, _range: unknown, max: number) => {
        asked.push(max)
        return Promise.resolve(null)
      },
      readMonthCells: (_owner: string, _range: unknown, max: number) => {
        asked.push(max)
        return Promise.resolve(null)
      },
    } as unknown as ExpenseRepository

    await expect(readMonthRows(stub, OWNER, { from: '2026-01', to: '2026-02' })).rejects.toThrow(`more than ${MAX_ROWS_PER_REQUEST} rows`)
    await expect(readMonthCube(stub, OWNER, { from: '2026-01', to: '2026-02' })).rejects.toThrow(`more than ${MAX_CUBE_CELLS} cells`)
    expect(asked).toEqual([MAX_ROWS_PER_REQUEST, MAX_CUBE_CELLS])
  })

  it('refuse with a ValidationError, which the route answers with a 400', async () => {
    const stub = { readMonthRows: () => Promise.resolve(null) } as unknown as ExpenseRepository
    await expect(readMonthRows(stub, OWNER, { from: '2026-01', to: '2026-02' })).rejects.toBeInstanceOf(ValidationError)
  })
})
