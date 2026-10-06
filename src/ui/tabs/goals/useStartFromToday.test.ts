import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { NewGoalScenario } from '../../../data/dataSource'
import { planFromToday } from '../../../engine'
import { makeScenario } from '../../../testing/factories'
import { useStartFromToday } from './useStartFromToday'

const latest = { investedCents: 138_700_00, date: '2026-10-05' }
const plan = makeScenario({ id: 1, name: 'Path A', isActive: true, planStartDate: '2026-06-25', startInvestedCents: 107_000_00 })
const other = makeScenario({ id: 2, name: 'Path B', planStartDate: '2026-06-26', startInvestedCents: 250_000_00 })
const draft = Object.fromEntries(
  Object.entries(plan).filter(([key]) => key !== 'id' && key !== 'isActive'),
) as NewGoalScenario

const input = {
  on: true,
  latest,
  scenarios: [plan, other],
  draft,
  activeScenario: plan,
  fromToday: planFromToday(plan, latest),
}

describe('useStartFromToday', () => {
  it('is the inputs as they came, so nothing redraws, while off or without a check-in', () => {
    const off = renderHook(() => useStartFromToday({ ...input, on: false })).result.current
    expect(off).toEqual({
      restarted: false,
      scenarios: input.scenarios,
      draft,
      activeScenario: plan,
      fromToday: input.fromToday,
      notRestarted: [],
    })
    expect(off.scenarios).toBe(input.scenarios)

    const none = renderHook(() => useStartFromToday({ ...input, latest: null })).result.current
    expect(none.restarted).toBe(false)
    expect(none.scenarios).toBe(input.scenarios)
  })

  it('starts every scenario, the draft and the loaded one from the check-in, whatever they started from', () => {
    const { result } = renderHook(() => useStartFromToday(input))
    expect(result.current.restarted).toBe(true)
    expect(result.current.scenarios.map((s) => [s.id, s.startInvestedCents, s.planStartDate])).toEqual([
      [1, 138_700_00, '2026-10-05'],
      [2, 138_700_00, '2026-10-05'],
    ])
    expect(result.current.draft.startInvestedCents).toBe(138_700_00)
    expect(result.current.activeScenario?.planStartDate).toBe('2026-10-05')
  })

  it('drops the dotted plan-from-today line, since the plan is now drawn from the check-in itself', () => {
    expect(renderHook(() => useStartFromToday(input)).result.current.fromToday).toBeNull()
  })

  it('keeps the loaded scenario empty when none is loaded', () => {
    const { result } = renderHook(() => useStartFromToday({ ...input, activeScenario: null }))
    expect(result.current.activeScenario).toBeNull()
  })

  it('gives back the same objects until something it reads changes', () => {
    const { result, rerender } = renderHook((props) => useStartFromToday(props), { initialProps: input })
    const first = result.current
    rerender({ ...input })
    expect(result.current).toBe(first)
    rerender({ ...input, scenarios: [plan] })
    expect(result.current).not.toBe(first)
  })

  describe('a what-if that owns the house from day one', () => {
    // Its starting balance is what is left after buying, so the check-in cannot stand in for it.
    const buyNow = makeScenario({
      id: 3,
      name: 'House now',
      planStartDate: '2026-06-26',
      startInvestedCents: 50_000_00,
      housePurchaseYear: 0,
      housePriceCents: 400_000_00,
    })

    it('keeps its own start, and says so by name', () => {
      const { result } = renderHook(() => useStartFromToday({ ...input, scenarios: [plan, buyNow] }))
      expect(result.current.scenarios[0]!.startInvestedCents).toBe(138_700_00)
      expect(result.current.scenarios[1]).toBe(buyNow)
      expect(result.current.notRestarted).toEqual(['House now'])
    })

    it('is kept the same way when its purchase date is already behind the check-in', () => {
      const bought = makeScenario({ id: 4, name: 'Bought last year', planStartDate: '2025-01-01', housePurchaseYear: 1, housePriceCents: 400_000_00 })
      const { result } = renderHook(() => useStartFromToday({ ...input, scenarios: [plan, bought] }))
      expect(result.current.scenarios[1]).toBe(bought)
      expect(result.current.notRestarted).toEqual(['Bought last year'])
    })

    it('is restarted when it is the plan, which the check-ins measure and which already owns the house', () => {
      const owned = makeScenario({ ...plan, housePurchaseYear: 0, housePriceCents: 400_000_00 })
      const { result } = renderHook(() => useStartFromToday({ ...input, scenarios: [owned, other], activeScenario: owned }))
      expect(result.current.scenarios[0]!.startInvestedCents).toBe(138_700_00)
      expect(result.current.notRestarted).toEqual([])
    })

    it('holds back the draft the same way, unless the loaded scenario is the plan', () => {
      const buyNowDraft = Object.fromEntries(
        Object.entries(buyNow).filter(([key]) => key !== 'id' && key !== 'isActive'),
      ) as NewGoalScenario
      const loadedWhatIf = renderHook(() =>
        useStartFromToday({ ...input, scenarios: [plan, buyNow], draft: buyNowDraft, activeScenario: buyNow }),
      ).result.current
      expect(loadedWhatIf.draft).toBe(buyNowDraft)
      expect(loadedWhatIf.activeScenario).toBe(buyNow)

      const loadedPlan = renderHook(() =>
        useStartFromToday({ ...input, draft: { ...buyNowDraft }, activeScenario: plan }),
      ).result.current
      expect(loadedPlan.draft.startInvestedCents).toBe(138_700_00)
    })

    it('does not count a scenario without a house price as one that owns a house', () => {
      const none = makeScenario({ id: 5, name: 'No house', housePurchaseYear: 0, housePriceCents: 0, planStartDate: '2026-06-26' })
      const { result } = renderHook(() => useStartFromToday({ ...input, scenarios: [plan, none] }))
      expect(result.current.scenarios[1]!.startInvestedCents).toBe(138_700_00)
      expect(result.current.notRestarted).toEqual([])
    })
  })

  it('leaves the scenarios it was given alone', () => {
    const before = JSON.stringify(input.scenarios)
    renderHook(() => useStartFromToday(input))
    expect(JSON.stringify(input.scenarios)).toBe(before)
  })
})
