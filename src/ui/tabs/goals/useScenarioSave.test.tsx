import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useScenarioSave } from './useScenarioSave'
import { draftFromDataset } from './goalsDefaults'
import { ToastContext } from '../../hooks/useToast'
import type { GoalScenario } from '../../../types'
import { makeDataset, makeScenario } from '../../../testing/factories'
import { scenarioToDraft } from './scenarioDraft'
import { makeActions } from '../../../testing/makeActions'

const draft = draftFromDataset(makeDataset(), 0)

function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(overrides: { activeId?: number | null; withActions?: boolean; saved?: GoalScenario | null; draft?: typeof draft } = {}) {
  const showToast = vi.fn()
  const actions = makeActions()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  )
  const { activeId = 7, withActions = true, saved = null, draft: written = draft } = overrides
  const hook = renderHook(
    () => useScenarioSave(withActions ? actions : undefined, activeId, written, 'Path A', saved),
    { wrapper },
  )
  return { ...hook, actions, showToast }
}

/** Presses Save and lets the write (already resolved, by default) settle. */
async function pressSave(result: { current: { save: () => void } }) {
  await act(async () => {
    result.current.save()
    await Promise.resolve()
  })
}

/** Vitest fails a run on an unhandled rejection, and one is what a failed save is meant to leave. */
async function collectUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
  const original = process.listeners('unhandledRejection')
  process.removeAllListeners('unhandledRejection')
  const seen: unknown[] = []
  process.on('unhandledRejection', (reason) => seen.push(reason))
  try {
    await run()
    await new Promise((resolve) => setTimeout(resolve, 0))
  } finally {
    process.removeAllListeners('unhandledRejection')
    for (const listener of original) process.on('unhandledRejection', listener)
  }
  return seen
}

describe('useScenarioSave', () => {
  it('writes the draft over the loaded scenario and says which one was saved', async () => {
    const { result, actions, showToast } = setup()

    await pressSave(result)

    expect(actions.updateScenario).toHaveBeenCalledWith(7, draft)
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith('Saved Path A', 'success')
  })

  it('writes only what was edited when it knows the scenario as saved, not the whole draft', async () => {
    const saved = makeScenario({ id: 7 })
    const edited = { ...scenarioToDraft(saved), monthlyContributionCents: saved.monthlyContributionCents + 100 }
    const { result, actions } = setup({ saved, draft: edited })

    await pressSave(result)

    expect(actions.updateScenario).toHaveBeenCalledWith(7, {
      monthlyContributionCents: saved.monthlyContributionCents + 100,
    })
  })

  it('says nothing until the write has landed', async () => {
    const write = deferred()
    const { result, actions, showToast } = setup()
    vi.mocked(actions.updateScenario).mockReturnValue(write.promise)

    act(() => result.current.save())
    expect(showToast).not.toHaveBeenCalled()

    await act(async () => {
      write.resolve()
      await write.promise
    })
    expect(showToast).toHaveBeenCalledTimes(1)
  })

  it('ignores a second save while the first is in flight', async () => {
    const write = deferred()
    const { result, actions, showToast } = setup()
    vi.mocked(actions.updateScenario).mockReturnValue(write.promise)

    act(() => {
      result.current.save()
      result.current.save()
    })
    expect(result.current.saving).toBe(true)
    act(() => result.current.save())
    expect(actions.updateScenario).toHaveBeenCalledTimes(1)

    await act(async () => {
      write.resolve()
      await write.promise
    })
    expect(result.current.saving).toBe(false)
    expect(showToast).toHaveBeenCalledTimes(1)

    await pressSave(result)
    expect(actions.updateScenario).toHaveBeenCalledTimes(2)
  })

  it('has nothing to save without a loaded scenario, or in a read-only session', () => {
    const detached = setup({ activeId: null })
    act(() => detached.result.current.save())
    expect(detached.actions.updateScenario).not.toHaveBeenCalled()
    expect(detached.result.current.saving).toBe(false)

    const readOnly = setup({ withActions: false })
    act(() => readOnly.result.current.save())
    expect(readOnly.actions.updateScenario).not.toHaveBeenCalled()
    expect(readOnly.result.current.saving).toBe(false)
  })

  it('leaves a failed write to the global failure toast, and lets the viewer try again', async () => {
    const write = deferred()
    const { result, actions, showToast } = setup()
    vi.mocked(actions.updateScenario).mockReturnValue(write.promise)

    const unhandled = await collectUnhandledRejections(async () => {
      act(() => result.current.save())
      await act(async () => {
        write.reject(new Error('boom'))
        await write.promise.catch(() => {})
      })
    })

    expect(unhandled).toEqual([expect.objectContaining({ message: 'boom' })])
    expect(showToast).not.toHaveBeenCalled()
    expect(result.current.saving).toBe(false)
  })
})
