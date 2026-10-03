import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_LEVERS, type LeverKey } from '../../../engine'
import { ToastContext } from '../../hooks/useToast'
import { LEVER_SPECS } from './leverFields'
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

  describe('the toast after a star takes an input out', () => {
    // The second of the bar's five, so that putting it back at the end would be a different list.
    const second = DEFAULTS[1]!
    const withoutSecond = DEFAULTS.filter((k) => k !== second)

    it('says which input left and offers to put it back', async () => {
      const { save, calls } = deferredSave()
      const { result, showToast } = setup(DEFAULTS, save)

      act(() => result.current.toggle(second))

      expect(showToast).toHaveBeenCalledTimes(1)
      const [message, tone, action] = showToast.mock.calls[0] as [string, string, { label: string; onAction: () => void }]
      expect(message).toBe(`Removed ${LEVER_SPECS[second].short} from the bar`)
      expect(tone).toBe('info')
      expect(action.label).toBe('Undo')
      await settle(() => calls[0]!.resolve())
    })

    it('puts the input back in the place it was, in one write', async () => {
      const { save, calls } = deferredSave()
      const { result, showToast } = setup(DEFAULTS, save)
      act(() => result.current.toggle(second))
      await settle(() => calls[0]!.resolve())
      const undo = (showToast.mock.calls[0]![2] as { onAction: () => void }).onAction

      act(() => undo())

      expect(result.current.keys).toEqual(DEFAULTS)
      expect(calls).toHaveLength(2)
      expect(calls[1]!.patch).toEqual({ goalLevers: DEFAULTS })
      await settle(() => calls[1]!.resolve())
    })

    it('puts it back in the list as it is by then, not the one it left', async () => {
      const { save, calls } = deferredSave()
      const { result, showToast } = setup(DEFAULTS, save)
      act(() => result.current.toggle(second))
      await settle(() => calls[0]!.resolve())
      const undo = (showToast.mock.calls[0]![2] as { onAction: () => void }).onAction
      // Another input is taken out after it: undoing must not bring that one back too.
      act(() => result.current.toggle(DEFAULTS[3]!))
      await settle(() => calls[1]!.resolve())

      act(() => undo())

      expect(result.current.keys).toEqual(DEFAULTS.filter((k) => k !== DEFAULTS[3]))
      await settle(() => calls[2]!.resolve())
    })

    it('does nothing when the input is back already or the bar is full again', async () => {
      const { save, calls } = deferredSave()
      const { result, showToast } = setup(DEFAULTS, save)
      act(() => result.current.toggle(second))
      await settle(() => calls[0]!.resolve())
      const undo = (showToast.mock.calls[0]![2] as { onAction: () => void }).onAction

      // Filled by another input from the panel.
      act(() => result.current.toggle('rentMonthlyCents'))
      await settle(() => calls[1]!.resolve())
      act(() => undo())
      expect(result.current.keys).toEqual([...withoutSecond, 'rentMonthlyCents'])
      expect(calls).toHaveLength(2)

      // The same input put back by hand, and then Undo pressed.
      act(() => result.current.toggle('rentMonthlyCents'))
      await settle(() => calls[2]!.resolve())
      act(() => result.current.toggle(second))
      await settle(() => calls[3]!.resolve())
      act(() => undo())
      expect(calls).toHaveLength(4)
    })

    it('is not shown for an input put in, only for one taken out', async () => {
      const { save, calls } = deferredSave()
      const { result, showToast } = setup(DEFAULTS.slice(0, 4), save)

      act(() => result.current.toggle('rentMonthlyCents'))

      expect(showToast).not.toHaveBeenCalled()
      await settle(() => calls[0]!.resolve())
    })
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
