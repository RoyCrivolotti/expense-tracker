import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, type LeverKey } from '../../../engine'
import { ToastContext } from '../../hooks/useToast'
import { useStarredLevers } from './useStarredLevers'

const DEFAULTS = [...DEFAULT_LEVERS]

/** Settles a save the test is holding, and lets what waits on it run. */
const settle = (action: () => void) =>
  act(async () => {
    action()
    await Promise.resolve()
  })

/** A save the test settles itself, so what happens while it is in flight can be looked at. */
function deferredSave() {
  const calls: { patch: { goalLevers?: LeverKey[] }; resolve: () => void; reject: (e: unknown) => void }[] = []
  const save = vi.fn(
    (patch: { goalLevers?: LeverKey[] }) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ patch, resolve, reject })
      }),
  )
  return { save, calls }
}

function setup(saved: readonly LeverKey[], save: ((patch: { goalLevers?: LeverKey[] }) => Promise<void>) | undefined) {
  const showToast = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  )
  const view = renderHook(({ list }) => useStarredLevers(list, save), { initialProps: { list: saved }, wrapper })
  return { ...view, showToast }
}

describe('useStarredLevers', () => {
  it('shows the saved list and says whether it is the defaults', () => {
    const { result } = setup(DEFAULTS, vi.fn().mockResolvedValue(undefined))
    expect(result.current.keys).toEqual(DEFAULTS)
    expect(result.current.isDefault).toBe(true)
    expect(result.current.canEdit).toBe(true)
    expect(result.current.canAdd).toBe(false)
  })

  it('takes an input out at once and saves the shorter list', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(DEFAULTS, save)

    act(() => result.current.toggle('horizonYears'))

    expect(result.current.keys).toEqual(DEFAULTS.filter((k) => k !== 'horizonYears'))
    expect(result.current.isDefault).toBe(false)
    expect(result.current.canAdd).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.patch).toEqual({ goalLevers: DEFAULTS.filter((k) => k !== 'horizonYears') })
    await settle(() => calls[0]!.resolve())
  })

  it('puts an input in at the end while there is room, and not past five', async () => {
    const four = DEFAULTS.slice(0, 4)
    const { save, calls } = deferredSave()
    const { result } = setup(four, save)

    act(() => result.current.toggle('rentMonthlyCents'))
    expect(result.current.keys).toEqual([...four, 'rentMonthlyCents'])
    await settle(() => calls[0]!.resolve())

    act(() => result.current.toggle('housePriceCents'))
    expect(result.current.keys).toHaveLength(5)
    expect(calls).toHaveLength(1)
  })

  it('sends only the newest choice made while a save is in flight', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(DEFAULTS, save)

    act(() => result.current.toggle('horizonYears'))
    act(() => result.current.toggle('startInvestedCents'))
    act(() => result.current.toggle('housePurchaseYear'))
    expect(calls).toHaveLength(1)
    expect(result.current.keys).toEqual(['monthlyContributionCents', 'expectedRealReturn'])

    await settle(() => calls[0]!.resolve())
    expect(calls).toHaveLength(2)
    expect(calls[1]!.patch).toEqual({ goalLevers: ['monthlyContributionCents', 'expectedRealReturn'] })
    await settle(() => calls[1]!.resolve())
    expect(result.current.keys).toEqual(['monthlyContributionCents', 'expectedRealReturn'])
  })

  it('does not take the saved list back in the middle of a run of choices', async () => {
    const { save, calls } = deferredSave()
    const { result, rerender } = setup(DEFAULTS, save)

    act(() => result.current.toggle('horizonYears'))
    act(() => result.current.toggle('startInvestedCents'))
    // The first save lands and the dataset refreshes with it, while the second is still queued.
    rerender({ list: DEFAULTS.filter((k) => k !== 'horizonYears') })
    expect(result.current.keys).toEqual(['monthlyContributionCents', 'expectedRealReturn', 'housePurchaseYear'])
    await settle(() => calls[0]!.resolve())
    await settle(() => calls[1]!.resolve())
  })

  it('takes a list saved from elsewhere when nothing is in flight', () => {
    const { result, rerender } = setup(DEFAULTS, vi.fn().mockResolvedValue(undefined))
    rerender({ list: ['rentMonthlyCents'] })
    expect(result.current.keys).toEqual(['rentMonthlyCents'])
  })

  it('puts the saved list back and says so when a save fails', async () => {
    const { save, calls } = deferredSave()
    const { result, showToast } = setup(DEFAULTS, save)

    act(() => result.current.toggle('horizonYears'))
    act(() => result.current.toggle('startInvestedCents'))
    await settle(() => calls[0]!.reject(new Error('boom')))

    expect(result.current.keys).toEqual(DEFAULTS)
    expect(showToast).toHaveBeenCalledWith("Something went wrong, so that change probably wasn't saved.", 'error')
    // Nothing queued behind the failure is sent on its own.
    expect(calls).toHaveLength(1)
    // And the next choice starts from the saved list, not from the one that failed.
    act(() => result.current.toggle('rentMonthlyCents'))
    expect(result.current.keys).toEqual(DEFAULTS)
  })

  it('puts the five back with reset, and does not send what is already saved', async () => {
    const { save, calls } = deferredSave()
    const { result } = setup(['rentMonthlyCents'], save)

    act(() => result.current.reset())
    expect(result.current.keys).toEqual(DEFAULTS)
    expect(calls[0]!.patch).toEqual({ goalLevers: DEFAULTS })
    await settle(() => calls[0]!.resolve())

    const again = setup(DEFAULTS, save)
    act(() => again.result.current.reset())
    expect(calls).toHaveLength(1)
  })

  it('changes nothing in a read-only session', () => {
    const { result } = setup(DEFAULTS, undefined)
    act(() => result.current.toggle('horizonYears'))
    act(() => result.current.reset())
    expect(result.current.keys).toEqual(DEFAULTS)
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canAdd).toBe(false)
  })
})
