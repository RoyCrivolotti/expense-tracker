import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeDataset } from '../../testing/factories'
import { PreferencesSetting } from './PreferencesSetting'

const TRIGGER = 'Budget month starts on day'

function deferred() {
  let resolve!: () => void
  let reject!: (err: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Finishes a pending save, inside act so the field's reaction is part of the step. */
async function settle(save: ReturnType<typeof deferred>, failure?: Error) {
  await act(async () => {
    if (failure) save.reject(failure)
    else save.resolve()
    await save.promise.catch(() => undefined)
  })
}

function renderSetting(budgetRolloverDay = 13, onChange = vi.fn().mockResolvedValue(undefined)) {
  const settings = { ...makeDataset().settings, budgetRolloverDay }
  const view = render(<PreferencesSetting settings={settings} onChange={onChange} />)
  return { onChange, settings, view }
}

async function pick(user: ReturnType<typeof userEvent.setup>, day: string) {
  await user.click(screen.getByRole('button', { name: TRIGGER }))
  await user.click(screen.getByRole('button', { name: day }))
}

describe('PreferencesSetting, budget month start day', () => {
  it('shows the saved day', () => {
    renderSetting(13)
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveTextContent('13th')
  })

  it('saves the picked day', async () => {
    const { onChange } = renderSetting(13)
    await pick(userEvent.setup(), '5th')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ budgetRolloverDay: 5 })
  })

  it('shows the picked day straight away, while the save is still on its way', async () => {
    // Bound to the saved settings, the field kept the old day on screen until the server answered.
    const save = deferred()
    renderSetting(13, vi.fn().mockReturnValue(save.promise))

    await pick(userEvent.setup(), '5th')

    expect(screen.getByRole('button', { name: TRIGGER })).toHaveTextContent('5th')
    await settle(save)
  })

  it('falls back to the saved day when the save fails', async () => {
    const save = deferred()
    renderSetting(13, vi.fn().mockReturnValue(save.promise))
    // The rejection is left unhandled on purpose, as it is for every other settings write.
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)

    await pick(userEvent.setup(), '5th')
    await settle(save, new Error('offline'))

    expect(screen.getByRole('button', { name: TRIGGER })).toHaveTextContent('13th')
    process.off('unhandledRejection', unhandled)
  })

  it('keeps the latest pick when an earlier save finishes after it', async () => {
    const first = deferred()
    const second = deferred()
    const onChange = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    renderSetting(13, onChange)
    const user = userEvent.setup()

    await pick(user, '5th')
    await pick(user, '20th')
    await settle(first)

    expect(screen.getByRole('button', { name: TRIGGER })).toHaveTextContent('20th')
    await settle(second)
  })

  it('does not save when the shown day is picked again', async () => {
    const { onChange } = renderSetting(13)
    await pick(userEvent.setup(), '13th')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('goes back to calendar months with one tap', async () => {
    const { onChange } = renderSetting(13)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: TRIGGER }))
    await user.click(screen.getByRole('button', { name: 'Calendar months' }))
    expect(onChange).toHaveBeenCalledWith({ budgetRolloverDay: 1 })
  })
})
