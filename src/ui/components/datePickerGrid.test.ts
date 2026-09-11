import { describe, expect, it } from 'vitest'
import { buildCalendarGrid, dayCellToIso } from './datePickerGrid'

describe('buildCalendarGrid', () => {
  it('returns exactly 6 rows of 7 columns', () => {
    const grid = buildCalendarGrid(2026, 9)
    expect(grid).toHaveLength(6)
    for (const row of grid) expect(row).toHaveLength(7)
  })

  it('starts the week on Monday', () => {
    // September 2026 starts on Tuesday (JS getDay()=2, Monday-based=1)
    const grid = buildCalendarGrid(2026, 9)
    // First cell should be Mon 31 Aug from the previous month
    expect(grid[0]![0]).toEqual({ year: 2026, month: 8, day: 31, outside: true })
    // Second cell should be Tue 1 Sep (the actual first day)
    expect(grid[0]![1]).toEqual({ year: 2026, month: 9, day: 1, outside: false })
  })

  it('marks days from adjacent months as outside', () => {
    const grid = buildCalendarGrid(2026, 9)
    const allCells = grid.flat()
    const outsideCells = allCells.filter((c) => c.outside)
    const insideCells = allCells.filter((c) => !c.outside)
    expect(insideCells).toHaveLength(30)
    expect(outsideCells.length).toBeGreaterThan(0)
    for (const cell of outsideCells) {
      expect(cell.month).not.toBe(9)
    }
  })

  it('handles month that starts on Monday (no leading outside days)', () => {
    // June 2026 starts on Monday
    const grid = buildCalendarGrid(2026, 6)
    expect(grid[0]![0]).toEqual({ year: 2026, month: 6, day: 1, outside: false })
  })

  it('handles year boundaries correctly (January)', () => {
    const grid = buildCalendarGrid(2026, 1)
    const firstCell = grid[0]![0]!
    expect(firstCell.outside).toBe(true)
    expect(firstCell.year).toBe(2025)
    expect(firstCell.month).toBe(12)
  })

  it('handles year boundaries correctly (December trailing)', () => {
    const grid = buildCalendarGrid(2026, 12)
    const lastRow = grid[5]!
    const trailingCells = lastRow.filter((c) => c.outside)
    for (const cell of trailingCells) {
      expect(cell.year).toBe(2027)
      expect(cell.month).toBe(1)
    }
  })

  it('handles February in a leap year', () => {
    const grid = buildCalendarGrid(2024, 2)
    const allCells = grid.flat()
    const febCells = allCells.filter((c) => !c.outside)
    expect(febCells).toHaveLength(29)
  })

  it('handles February in a non-leap year', () => {
    const grid = buildCalendarGrid(2025, 2)
    const allCells = grid.flat()
    const febCells = allCells.filter((c) => !c.outside)
    expect(febCells).toHaveLength(28)
  })
})

describe('dayCellToIso', () => {
  it('pads month and day to two digits', () => {
    expect(dayCellToIso({ year: 2026, month: 1, day: 5, outside: false })).toBe('2026-01-05')
  })

  it('formats a normal date', () => {
    expect(dayCellToIso({ year: 2026, month: 9, day: 11, outside: false })).toBe('2026-09-11')
  })
})
