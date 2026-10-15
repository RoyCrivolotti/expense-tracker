import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeTransaction } from '../../testing/factories'
import type { ExpenseModel } from '../useExpenseData'
import { resetStoppedSuggestionsForTests, useStoppedSuggestions } from './stoppedSuggestions'
import { useUpcoming } from './useUpcoming'

/** Gym, on the 20th from January to September; the next charge is on 20 October. */
const GYM = Array.from({ length: 9 }, (_, i) =>
  makeTransaction({
    id: i + 1,
    description: 'Gym',
    date: `2026-${String(i + 1).padStart(2, '0')}-20`,
    budgetMonth: `2026-${String(i + 1).padStart(2, '0')}`,
  }),
)

function modelWith(transactions = GYM, months = ['2026-08', '2026-09']): ExpenseModel {
  return { dataset: makeDataset({ transactions }), months } as ExpenseModel
}

describe('useUpcoming', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoppedSuggestionsForTests()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-19T12:00:00'))
  })
  afterEach(() => vi.useRealTimers())

  const dates = (model: ExpenseModel, month: string) =>
    renderHook(() => useUpcoming(model, month)).result.current.suggestions.map((s) => s.predictedDate)

  it('says which day the charges were worked out for, for the rows to be worded against', () => {
    const { result } = renderHook(() => useUpcoming(modelWith(), '2026-10'))
    expect(result.current.today).toBe('2026-10-19')
  })

  it('lists the charge that is due today', () => {
    expect(dates(modelWith(), '2026-10')).toEqual(['2026-10-20'])
  })

  it('lists it above the month today falls in even when the newest month with data is behind', () => {
    // The default view stays on September until something is logged in October.
    expect(dates(modelWith(), '2026-09')).toEqual(['2026-10-20'])
  })

  it('lists it above the newest month with data when that is ahead of the calendar', () => {
    expect(dates(modelWith(GYM, ['2026-09', '2026-10', '2026-11']), '2026-11')).toEqual(['2026-10-20'])
  })

  it('lists the same charges whichever of those months is open', () => {
    const model = modelWith(GYM, ['2026-09', '2026-10', '2026-11'])
    expect(dates(model, '2026-10')).toEqual(dates(model, '2026-11'))
  })

  it('stays out of a month that is being looked back at', () => {
    const model = modelWith(GYM, ['2026-07', '2026-08', '2026-09', '2026-10'])
    expect(dates(model, '2026-09')).toEqual([])
    expect(dates(model, '2026-07')).toEqual([])
  })

  it('does not need the list of months to know where the newest one is', () => {
    expect(dates(modelWith(GYM, []), '2026-10')).toEqual(['2026-10-20'])
  })

  it('goes once the charge is logged', () => {
    const logged = [...GYM, makeTransaction({ id: 20, description: 'Gym', date: '2026-10-19', budgetMonth: '2026-10' })]
    expect(dates(modelWith(logged), '2026-10')).toEqual([])
  })

  it('goes a week after its date and is gone for the rest of the month', () => {
    vi.setSystemTime(new Date('2026-10-27T12:00:00'))
    expect(dates(modelWith(), '2026-10')).toEqual(['2026-10-20'])
    vi.setSystemTime(new Date('2026-10-28T12:00:00'))
    expect(dates(modelWith(), '2026-10')).toEqual([])
  })

  describe('a series stopped on this device', () => {
    const GYM_KEY = 'gym|1|1|expense'

    it('is left out, and comes back when it is taken back', () => {
      const { result } = renderHook(() => ({ upcoming: useUpcoming(modelWith(), '2026-10'), list: useStoppedSuggestions() }))
      expect(result.current.upcoming.suggestions).toHaveLength(1)

      act(() => result.current.list.stop(GYM_KEY, { after: '2026-09-20', label: 'Gym' }))
      expect(result.current.upcoming.suggestions).toEqual([])

      act(() => result.current.list.restore(GYM_KEY))
      expect(result.current.upcoming.suggestions).toHaveLength(1)
    })

    it('comes back by itself when a charge after the one it was stopped at is logged', () => {
      const stopped = { [GYM_KEY]: { after: '2026-09-20', label: 'Gym' } }
      localStorage.setItem('expense:stopped-recurring', JSON.stringify(stopped))
      expect(dates(modelWith(), '2026-10')).toEqual([])

      vi.setSystemTime(new Date('2026-11-19T12:00:00'))
      const resumed = [...GYM, makeTransaction({ id: 20, description: 'Gym', date: '2026-10-20', budgetMonth: '2026-10' })]
      expect(dates(modelWith(resumed, ['2026-09', '2026-10', '2026-11']), '2026-11')).toEqual(['2026-11-20'])
    })
  })
})
