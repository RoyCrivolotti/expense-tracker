import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import type { ExpenseSettings } from '../../types'
import { TipCard } from './TipCard'
import { TipLink } from './TipLink'
import { TipsProvider } from './TipsProvider'
import { useTips } from './tipsContext'

type Save = (patch: Partial<ExpenseSettings>) => Promise<void>

function Page({
  saved,
  hasTransactions = true,
  save,
}: {
  saved: string[] | undefined
  hasTransactions?: boolean
  save: Save | undefined
}) {
  return (
    <TipsProvider saved={saved} hasTransactions={hasTransactions} save={save}>
      <TipCard id="first-tip" title="First">
        One thing.
      </TipCard>
      <TipCard id="second-tip" title="Second" actionLabel="Understood">
        Another.
      </TipCard>
      <Again />
    </TipsProvider>
  )
}
function Again() {
  const { showAgain } = useTips()
  return (
    <button type="button" onClick={() => void showAgain()}>
      again
    </button>
  )
}
const region = (name: string) => screen.queryByRole('region', { name })

describe('TipCard', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('puts each card away on its own button, with the list so far', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    render(<Page saved={[]} save={save} />)

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }))

    expect(region('First')).toBeNull()
    expect(region('Second')).toBeNull()
    // Sent one after the other before the first save has come back, the second still carries the first.
    expect(save.mock.calls.map(([patch]) => patch.tipsSeen)).toEqual([['first-tip'], ['first-tip', 'second-tip']])
  })

  it('hands the keyboard focus to the next control when the card that has it goes, so the person is not sent to the top of the page', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    render(<Page saved={[]} save={save} />)
    const first = screen.getByRole('button', { name: 'Got it' })
    first.focus()
    expect(document.activeElement).toBe(first)

    fireEvent.click(first)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Understood' }))
  })

  it('skips a next control that cannot be reached (hidden or inert) and lands on one that can', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    render(
      <div>
        <Page saved={[]} save={save} />
        <button type="button" hidden>
          hidden
        </button>
      </div>,
    )
    // The second card's own button comes first in the page; take it away so the hidden one would be next.
    fireEvent.click(screen.getByRole('button', { name: 'Understood' }))
    const first = screen.getByRole('button', { name: 'Got it' })
    first.focus()

    fireEvent.click(first)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'again' }))
  })

  it('leaves the focus alone when it was not in the card', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    render(<Page saved={[]} save={save} />)
    const again = screen.getByRole('button', { name: 'again' })
    again.focus()

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

    expect(document.activeElement).toBe(again)
  })

  it("runs the button's own action as well as putting the card away", () => {
    const onAction = vi.fn()
    render(
      <TipsProvider saved={[]} hasTransactions save={vi.fn<Save>().mockResolvedValue()}>
        <TipCard id="first-tip" title="First" onAction={onAction}>
          One thing.
        </TipCard>
      </TipsProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

    expect(onAction).toHaveBeenCalledTimes(1)
    expect(region('First')).toBeNull()
  })

  it('shows nothing without a way to save, so a session that cannot write never shows a tip', () => {
    render(<Page saved={[]} save={undefined} />)
    expect(region('First')).toBeNull()
  })

  it('shows nothing to an established account and everything to a new one', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    const { rerender } = render(<Page saved={undefined} save={save} />)
    expect(region('First')).toBeNull()

    rerender(<Page saved={[]} save={save} />)
    expect(region('First')).toBeInTheDocument()
    expect(region('Second')).toBeInTheDocument()
  })

  it('brings every card back for a new list, and forgets what this visit had put away', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    render(<Page saved={[]} save={save} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(region('First')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'again' }))

    expect(save).toHaveBeenLastCalledWith({ tipsSeen: [] })
    expect(region('First')).toBeInTheDocument()
  })
})

describe('TipCard motion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })
  const save = () => vi.fn<Save>().mockResolvedValue()
  const foldOf = (name: string) => region(name)!.parentElement!.parentElement!

  it('folds shut over the fold time, inert while it does, still saying what it said, then goes', () => {
    render(<Page saved={[]} save={save()} />)
    const fold = foldOf('First')
    expect(fold.className).not.toContain('leaving')

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))

    expect(region('First')).toBeInTheDocument()
    expect(fold.className).toContain('leaving')
    expect(fold.hasAttribute('inert')).toBe(true)
    expect(fold.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.fold}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.fold))
    expect(region('First')).toBeNull()
  })

  it('does not animate in when it is there as the page draws', () => {
    render(<Page saved={[]} save={save()} />)
    expect(foldOf('First').className).not.toContain('arriving')
  })

  it('folds open when it comes back after the page has drawn', () => {
    const write = save()
    const { rerender } = render(<Page saved={['first-tip']} save={write} />)
    expect(region('First')).toBeNull()

    // What the account then holds, once the empty list has been saved.
    rerender(<Page saved={[]} save={write} />)

    expect(foldOf('First').className).toContain('arriving')
  })
})

describe('TipCard with a second way out', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('puts the card away on the link without doing what the button does, and hands the focus on', () => {
    const save = vi.fn<Save>().mockResolvedValue()
    const action = vi.fn()
    render(
      <TipsProvider saved={[]} hasTransactions save={save}>
        <TipCard id="one" title="One" actionLabel="Do it" onAction={action} secondary={<TipLink>Not now</TipLink>}>
          Said once.
        </TipCard>
        <button type="button">after</button>
      </TipsProvider>,
    )
    const link = screen.getByRole('button', { name: 'Not now' })
    link.focus()

    fireEvent.click(link)

    expect(region('One')).toBeNull()
    expect(action).not.toHaveBeenCalled()
    expect(save).toHaveBeenCalledWith({ tipsSeen: ['one'] })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'after' }))
  })
})
