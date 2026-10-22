import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { recurringFixedGroupsFromSeries, seriesFromTransactions } from '../../domain/engine/recurringSeries'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { withHistory } from '../buildLedgerModel'
import type { ExpenseModel } from '../useExpenseData'
import { resetStoppedSuggestionsForTests, useStoppedSuggestions } from './stoppedSuggestions'
import { upcomingOf, useUpcoming } from './useUpcoming'

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

  describe('a model that holds only some of the rows', () => {
    const history = { groups: recurringFixedGroupsFromSeries(seriesFromTransactions(GYM)) }
    /** The window: the last two months of the gym, which is too few rows to be a series. */
    const window = GYM.slice(-2)
    const windowed = (extra: Partial<ExpenseModel> = {}): ExpenseModel => ({
      ...modelWith(window),
      sums: makeDataset({ transactions: window }),
      ...extra,
    })

    it('offers the charge the series say is due, though the rows it holds are too few to show it', () => {
      expect(dates(windowed({ history }), '2026-10')).toEqual(['2026-10-20'])
      expect(dates(modelWith(window), '2026-10')).toEqual([])
    })

    it('tells the model a screen is using the series while it is mounted', () => {
      const stop = vi.fn()
      const watchHistory = vi.fn(() => stop)
      const { unmount } = renderHook(() => useUpcoming(windowed({ history, watchHistory }), '2026-10'))
      expect(watchHistory).toHaveBeenCalledTimes(1)
      expect(stop).not.toHaveBeenCalled()
      unmount()
      expect(stop).toHaveBeenCalledTimes(1)
    })

    it('goes once the charge is logged, without waiting for the series to be read again, because the model folds it in', () => {
      const logged = makeTransaction({ id: 50, description: 'Gym', date: '2026-10-19', budgetMonth: '2026-10' })
      const stale = windowed({ dataset: makeDataset({ transactions: [...window, logged] }) })
      expect(dates({ ...stale, history }, '2026-10')).toEqual(['2026-10-20'])
      expect(dates(withHistory(stale, seriesFromTransactions(GYM)), '2026-10')).toEqual([])
    })
  })

  describe('a window whose rows look regular though the whole history is not', () => {
    // A cleaner who came at odd intervals and then every month on the 20th: the loaded rows alone are a monthly
    // charge, and with the older ones it is not regular enough to be one. The rent is monthly all the way through.
    const IRREGULAR = [3, 61, 8, 75, 12, 48, 15, 90]
    const before: string[] = []
    let at = Date.parse('2026-01-20T00:00:00Z')
    for (const gap of IRREGULAR) {
      at -= gap * 86_400_000
      before.push(new Date(at).toISOString().slice(0, 10))
    }
    const monthly = GYM.map((g) => g.date)
    const rows = (description: string, dates: string[], firstId: number) =>
      dates.map((date, i) => makeTransaction({ id: firstId + i, description, date, budgetMonth: date.slice(0, 7) }))
    const everything = [...rows('Cleaner', [...before, ...monthly], 100), ...rows('Rent', monthly, 300)]
    const loaded = [...rows('Cleaner', monthly.slice(3), 200), ...rows('Rent', monthly.slice(3), 400)]
    const history = { groups: recurringFixedGroupsFromSeries(seriesFromTransactions(everything)) }
    const windowed = (extra: Partial<ExpenseModel> = {}): ExpenseModel => ({
      ...modelWith(loaded),
      sums: makeDataset({ transactions: loaded }),
      ...extra,
    })
    const offered = (model: ExpenseModel) =>
      renderHook(() => useUpcoming(model, '2026-10')).result.current.suggestions.map((s) => s.description)

    it('would offer both from the loaded rows, which is why it offers nothing until the series arrive', () => {
      expect(offered(modelWith(loaded))).toEqual(['Cleaner', 'Rent'])
      expect(offered(windowed())).toEqual([])
    })

    it('offers what the whole history says once they have, the rent and not the cleaner', () => {
      expect(offered(windowed({ history }))).toEqual(['Rent'])
      expect(upcomingOf(everything, undefined, '2026-10-19', {}).map((s) => s.description)).toEqual(['Rent'])
    })
  })
})
