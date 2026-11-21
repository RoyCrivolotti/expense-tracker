import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../../hooks/motion'
import { makeScenario } from '../../../testing/factories'
import { samplePlan } from '../../../testing/samplePlan'
import { scenarioToDraft } from './scenarioDraft'
import { StartLaterButton, StartLaterHost } from './StartLaterHost'
import { StartLaterSheet, type StartLater } from './StartLaterSheet'

/** The sheet opens on today when there is no check-in: a fixed today keeps these tests from ageing. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 21, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

function later(over: Partial<StartLater> = {}): StartLater {
  return {
    source: scenarioToDraft(samplePlan({ name: 'Path B', color: '#f59e0b' })),
    checkins: [{ investedCents: 9_000_000, date: '2026-10-01' }],
    scenarios: [makeScenario({ id: 1 })],
    onCreate: vi.fn(),
    ...over,
  }
}

const balance = () => screen.getByRole('textbox', { name: 'Starting balance' })

describe('StartLaterSheet', () => {
  it('opens on the latest check-in, with its balance, and names the source apart from the words around it', () => {
    render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Start a copy of "Path B" later' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start date' })).toHaveTextContent('1 Oct 2026')
    expect(balance()).toHaveValue('90.000,00')
    expect(screen.getByText(/Your investments in your check-in of/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Path B, from 2026')
    // The house is bought on the copy's own anniversary, and what that does is said with the name set apart.
    const line = screen.getByText(/it owns it for longer/).closest('li')!
    expect(line.querySelector('span > span[aria-hidden]')).not.toBeNull()
  })

  it('keeps a typed balance, offers the suggestion back, and goes back to it on Use', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    await user.clear(balance())
    await user.type(balance(), '80000{Enter}')
    expect(balance()).toHaveValue('80.000,00')
    await user.click(screen.getByRole('button', { name: 'Use 90.000 €' }))
    expect(balance()).toHaveValue('90.000,00')
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('puts back what the box held when the text typed is not an amount', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    await user.clear(balance())
    await user.type(balance(), '90k{Enter}')
    expect(balance()).toHaveValue('90.000,00')
  })

  it('keeps following the date when the box was only touched, by leaving it or by Enter', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    await user.click(balance())
    await user.tab()
    await user.click(balance())
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: 'Start date' }))
    for (let i = 0; i < 3; i += 1) await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getAllByRole('button', { name: /^15 / })[0]!)
    expect(screen.getByRole('button', { name: 'Start date' })).toHaveTextContent('15 Jan 2027')
    expect(balance()).not.toHaveValue('90.000,00')
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('holds a balance typed below nothing to nothing', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    await user.clear(balance())
    await user.type(balance(), '-5000{Enter}')
    expect(balance()).toHaveValue('0,00')
  })

  it('makes one copy on a double press, from the source and the typed name, and closes', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(<StartLaterSheet {...later({ onCreate })} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'House later' } })
    await user.dblClick(screen.getByRole('button', { name: 'Create scenario' }))
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ name: 'House later', planStartDate: '2026-10-01', startInvestedCents: 9_000_000 })
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty('isActive')
    expect(onClose).toHaveBeenCalled()
  })

  it('leaves without making anything on Cancel', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const onCreate = vi.fn()
    const onClose = vi.fn()
    render(<StartLaterSheet {...later({ onCreate })} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('says why a source with no start cannot be copied later, and offers no Create', () => {
    const source = { ...scenarioToDraft(samplePlan({ name: 'Path B' })), planStartDate: null }
    render(<StartLaterSheet {...later({ source })} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Path B has no start date. Set one under Plan start first.')
    expect(screen.queryByRole('textbox', { name: 'Starting balance' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Create scenario' })).toBeDisabled()
  })

  it('opens on today without a check-in, which before a later source’s start is refused', () => {
    const source = scenarioToDraft(samplePlan({ name: 'Path B', planStartDate: '2027-03-01' }))
    render(<StartLaterSheet {...later({ source, checkins: [] })} onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Pick a date on or after Path B's start")
  })

  it('names the source it opened on while it leaves, though the editor has moved on to the copy', () => {
    const { rerender } = render(<StartLaterSheet {...later()} onClose={vi.fn()} />)
    rerender(<StartLaterSheet {...later({ source: scenarioToDraft(samplePlan({ name: 'Path B, from 2026' })) })} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Start a copy of "Path B" later' })).toBeInTheDocument()
  })
})

describe('StartLaterHost leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 21, 12))
    setMotionDisabledForTests(false)
  })
  afterEach(() => setMotionDisabledForTests(true))

  it('holds the sheet through its exit, taking no taps, then lets it go', () => {
    const props = later()
    const { rerender } = render(<StartLaterHost open startLater={props} onClose={vi.fn()} />)
    rerender(<StartLaterHost open={false} startLater={props} onClose={vi.fn()} />)
    const leaving = screen.getByRole('dialog', { name: /Start a copy of/ })
    expect(leaving.closest('[inert]')).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(EXIT_MS.sheet + 50)
    })
    expect(screen.queryByRole('dialog', { name: /Start a copy of/ })).toBeNull()
  })
})

describe('StartLaterButton', () => {
  it('opens the sheet from the phone’s scenario card, and is held while a copy is being made', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { rerender } = render(<StartLaterButton startLater={later()} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Start a copy later…' }))
    expect(screen.getByRole('dialog', { name: 'Start a copy of "Path B" later' })).toBeInTheDocument()
    rerender(<StartLaterButton startLater={later()} disabled />)
    expect(screen.getByRole('button', { name: 'Start a copy later…' })).toBeDisabled()
  })
})
