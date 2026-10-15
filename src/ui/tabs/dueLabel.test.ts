import { describe, expect, it } from 'vitest'
import { dueLabel, daysUntilDue } from './dueLabel'

describe('daysUntilDue', () => {
  it('counts the days from today to the date, negative once it has passed', () => {
    expect(daysUntilDue('2026-10-20', '2026-10-18')).toBe(2)
    expect(daysUntilDue('2026-10-18', '2026-10-18')).toBe(0)
    expect(daysUntilDue('2026-10-16', '2026-10-18')).toBe(-2)
  })

  it('crosses a month and a year end the way the calendar does', () => {
    expect(daysUntilDue('2026-11-01', '2026-10-30')).toBe(2)
    expect(daysUntilDue('2026-12-30', '2027-01-02')).toBe(-3)
  })
})

describe('dueLabel', () => {
  it.each([
    [0, 'Due today'],
    [1, 'Due tomorrow'],
    [2, 'Due in 2 days'],
    [5, 'Due in 5 days'],
    [-1, 'Due yesterday'],
    [-2, 'Due 2 days ago'],
    [-7, 'Due 7 days ago'],
  ])('reads %i days as "%s"', (days, label) => {
    expect(dueLabel(days)).toBe(label)
  })
})
