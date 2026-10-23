import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecurringSuggestion } from '../../engine'
import { AccountOwnerContext } from '../hooks/accountOwner'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { ToastContext, type ToastApi } from '../hooks/useToast'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import { resetStoppedSuggestionsForTests } from './stoppedSuggestions'
import { UpcomingCard } from './UpcomingCard'

const DISMISSED_KEY = 'expense:dismissed-recurring'
const STOPPED_KEY = 'expense:stopped-recurring'

const lookup: Lookup = {
  category: () => undefined,
  account: () => undefined,
  flag: () => undefined,
  label: () => undefined,
  attachments: () => [],
  attachmentCount: () => 0,
  categoryName: () => 'Subscriptions',
  accountName: () => 'Santander',
  installmentPlan: () => undefined,
  settlementFor: () => undefined,
  settledBy: () => [],
}

function makeSuggestion(overrides: Partial<RecurringSuggestion> = {}): RecurringSuggestion {
  return {
    seriesKey: 'netflix|1|1|expense',
    lastChargeDate: '2026-08-24',
    description: 'Netflix',
    type: 'expense',
    accountId: 1,
    categoryId: 1,
    amountCents: 1500,
    predictedDate: '2026-09-24',
    predictedBudgetMonth: '2026-09',
    leadDays: 1,
    ...overrides,
  }
}

function renderCard(
  suggestions: RecurringSuggestion[],
  {
    month = '2026-09',
    today = '2026-09-24',
    onAdd = () => {},
    showToast = () => {},
    owner,
  }: {
    owner?: string
    month?: string
    today?: string
    onAdd?: (seed?: TransactionSeed) => void
    showToast?: ToastApi['showToast']
  } = {},
) {
  return render(
    <AccountOwnerContext value={owner}>
      <MoneyFormatProvider currencyCode="EUR" numberLocale="en-US">
        <ToastContext.Provider value={{ showToast }}>
          <UpcomingCard suggestions={suggestions} month={month} today={today} lookup={lookup} onAdd={onAdd} />
        </ToastContext.Provider>
      </MoneyFormatProvider>
    </AccountOwnerContext>,
  )
}

describe('UpcomingCard', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStoppedSuggestionsForTests()
  })

  it('lists each suggestion with its category, amount, how it falls against today and its date', () => {
    renderCard([makeSuggestion({ amountCents: 1599, predictedDate: '2026-09-24' })])
    const info = screen.getByText('Netflix').parentElement!
    expect(info.textContent).toBe('NetflixSubscriptions · €15.99Due today · Thu 24 Sept')
  })

  it('renders nothing when there is nothing to suggest', () => {
    const { container } = renderCard([])
    expect(container.firstChild).toBeNull()
  })

  describe('how a charge is worded against today', () => {
    const due = (predictedDate: string) => {
      renderCard([makeSuggestion({ predictedDate })], { today: '2026-09-24' })
      return screen.getByText(/^Due /)
    }

    it('says today for a charge due today', () => {
      expect(due('2026-09-24').textContent).toBe('Due today')
    })

    it('says tomorrow', () => {
      expect(due('2026-09-25').textContent).toBe('Due tomorrow')
    })

    it('counts the days to a charge further ahead', () => {
      expect(due('2026-09-27').textContent).toBe('Due in 3 days')
    })

    it('says yesterday for a charge that was due the day before', () => {
      expect(due('2026-09-23').textContent).toBe('Due yesterday')
    })

    it('counts the days since a charge that is further overdue, with its date after it', () => {
      renderCard([makeSuggestion({ predictedDate: '2026-09-20' })], { today: '2026-09-24' })
      expect(screen.getByText('Due 4 days ago')).toBeDefined()
      expect(screen.getByText('Due 4 days ago').parentElement!.textContent).toBe('Due 4 days ago · Sun 20 Sept')
    })

    it('words it against the day it was given, not the clock', () => {
      renderCard([makeSuggestion({ predictedDate: '2026-09-24' })], { today: '2026-09-20' })
      expect(screen.getByText('Due in 4 days')).toBeDefined()
    })
  })

  describe('a long card', () => {
    const names = ['Gym', 'Rent', 'Streaming', 'Phone', 'Cloud', 'Music', 'News']
    const suggestionsFor = (count: number) =>
      names.slice(0, count).map((description, i) =>
        makeSuggestion({ description, seriesKey: `${description.toLowerCase()}|1|1|expense`, predictedDate: `2026-09-${String(20 + i).padStart(2, '0')}` }),
      )
    const foldOf = (description: string) => screen.getByText(description).closest('[inert]')

    it('shows up to four rows in full, with nothing to expand', () => {
      renderCard(suggestionsFor(4))
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
      for (const name of names.slice(0, 4)) expect(foldOf(name)).toBeNull()
    })

    it('keeps three rows in view from five rows and folds the rest behind a button that says how many', () => {
      renderCard(suggestionsFor(5))
      for (const name of names.slice(0, 3)) expect(foldOf(name)).toBeNull()
      expect(foldOf('Phone')).not.toBeNull()
      expect(foldOf('Cloud')).not.toBeNull()
      const toggle = screen.getByRole('button', { name: 'Show 2 more' })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })

    it('counts a longer fold', () => {
      renderCard(suggestionsFor(7))
      expect(screen.getByRole('button', { name: 'Show 4 more' })).toBeDefined()
    })

    it('opens the folded rows and closes them again', () => {
      renderCard(suggestionsFor(5))
      fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
      expect(foldOf('Phone')).toBeNull()
      const toggle = screen.getByRole('button', { name: 'Show fewer' })
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(toggle)
      expect(foldOf('Cloud')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Show 2 more' })).toBeDefined()
    })

    it('names the rows it controls', () => {
      renderCard(suggestionsFor(5))
      const toggle = screen.getByRole('button', { name: 'Show 2 more' })
      const controlled = document.getElementById(toggle.getAttribute('aria-controls')!)
      expect(controlled).not.toBeNull()
      expect(controlled!.textContent).toContain('Phone')
    })

    it('keeps the order of the rows across the fold, oldest date first', () => {
      renderCard(suggestionsFor(6))
      const order = screen.getAllByText(/^(Gym|Rent|Streaming|Phone|Cloud|Music)$/).map((el) => el.textContent)
      expect(order).toEqual(['Gym', 'Rent', 'Streaming', 'Phone', 'Cloud', 'Music'])
    })

    it('shows every row once a dismissal brings it down to four, and the button goes', () => {
      renderCard(suggestionsFor(5))
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Gym' }))
      expect(screen.queryByRole('button', { name: /^Show / })).toBeNull()
      expect(foldOf('Phone')).toBeNull()
      expect(foldOf('Cloud')).toBeNull()
    })

    it('hands the focus to a row that is in view, not to one that is folded', async () => {
      renderCard(suggestionsFor(5))
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Streaming' }))
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Phone' }))
    })
  })

  describe('a charge that files under another budget month', () => {
    it('is marked with its own month, and one for the month on screen is not', () => {
      renderCard(
        [
          makeSuggestion({ description: 'Gym', predictedDate: '2026-09-20', predictedBudgetMonth: '2026-09' }),
          makeSuggestion({ description: 'Rent', predictedDate: '2026-09-25', predictedBudgetMonth: '2026-10' }),
        ],
        { month: '2026-10' },
      )
      expect(screen.getByText('For Sep')).toBeDefined()
      expect(screen.getAllByText(/^For /)).toHaveLength(1)
    })

    it('marks the one that files out of sight when the screen is behind the calendar', () => {
      // The newest month with data is still October after the rollover, so a charge due now that
      // files under November is the one that needs saying.
      renderCard(
        [
          makeSuggestion({ description: 'Insurance', predictedBudgetMonth: '2026-10' }),
          makeSuggestion({ description: 'Streaming', predictedBudgetMonth: '2026-11' }),
        ],
        { month: '2026-10' },
      )
      expect(screen.getByText('For Nov')).toBeDefined()
      expect(screen.queryByText('For Oct')).toBeNull()
    })

    it('names the month before the year turns', () => {
      renderCard([makeSuggestion({ predictedBudgetMonth: '2026-12' })], { month: '2027-01' })
      expect(screen.getByText('For Dec')).toBeDefined()
    })
  })

  describe('adding a suggestion', () => {
    it('seeds the whole transaction, filed under the suggestion own budget month on its own date', () => {
      const onAdd = vi.fn()
      renderCard(
        [
          makeSuggestion({
            description: 'Payroll',
            type: 'income',
            accountId: 3,
            categoryId: 8,
            amountCents: 320_000,
            predictedDate: '2026-09-25',
            predictedBudgetMonth: '2026-10',
          }),
        ],
        { onAdd },
      )
      fireEvent.click(screen.getByRole('button', { name: 'Add Payroll' }))
      expect(onAdd).toHaveBeenCalledWith({
        description: 'Payroll',
        type: 'income',
        accountId: 3,
        categoryId: 8,
        amountCents: 320_000,
        date: '2026-09-25',
        budgetMonth: '2026-10',
      })
    })
  })

  describe('dismissing a suggestion', () => {
    it('hides it and keeps it hidden the next time the card is shown', () => {
      const { unmount } = renderCard([makeSuggestion()])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Netflix' }))
      expect(screen.queryByText('Netflix')).toBeNull()
      unmount()
      renderCard([makeSuggestion()])
      expect(screen.queryByText('Netflix')).toBeNull()
    })

    it('says so, with an Undo that brings it back and keeps it back', () => {
      const showToast = vi.fn<ToastApi['showToast']>()
      const { unmount } = renderCard([makeSuggestion()], { showToast })
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Netflix' }))
      expect(showToast).toHaveBeenCalledWith(
        'Dismissed Netflix',
        'info',
        expect.objectContaining({ label: 'Undo' }),
      )
      act(() => showToast.mock.calls[0]![2]!.onAction())
      expect(screen.getByText('Netflix')).toBeDefined()
      unmount()
      renderCard([makeSuggestion()])
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it.each<[string, Partial<RecurringSuggestion>]>([
      ['description', { description: 'Disney' }],
      ['category', { categoryId: 3 }],
      ['account', { accountId: 2 }],
      ['type', { type: 'income' }],
      ['budget month', { predictedBudgetMonth: '2026-10' }],
    ])('does not hide a charge that differs in its %s', (_name, other) => {
      const { unmount } = renderCard([makeSuggestion()])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Netflix' }))
      unmount()
      renderCard([makeSuggestion(other)])
      expect(screen.getByText(other.description ?? 'Netflix')).toBeDefined()
    })

    it('hides only the one that was dismissed when two share a name', () => {
      renderCard([makeSuggestion({ categoryId: 7 }), makeSuggestion({ categoryId: 3, amountCents: 2400 })])
      fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss Netflix' })[0]!)
      expect(screen.getAllByText('Netflix')).toHaveLength(1)
    })

    it('moves the focus to the row that takes its place', async () => {
      renderCard([
        makeSuggestion({ description: 'Gym' }),
        makeSuggestion({ description: 'Rent' }),
        makeSuggestion({ description: 'Streaming' }),
      ])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Rent' }))
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Streaming' }))
    })

    it('moves the focus up when the last row was dismissed', async () => {
      renderCard([makeSuggestion({ description: 'Gym' }), makeSuggestion({ description: 'Rent' })])
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Rent' }))
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve))
      })
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Gym' }))
    })

    it('still honours a dismissal saved under the key from before it carried the category', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(['Netflix|1|2026-09']))
      renderCard([makeSuggestion()])
      expect(screen.queryByText('Netflix')).toBeNull()
    })

    it('does not carry over to the same series in another budget month', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(['Netflix|1|1|expense|2026-08']))
      renderCard([makeSuggestion()])
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it('shows the card as usual when the saved dismissals cannot be read', () => {
      localStorage.setItem(DISMISSED_KEY, '{not json')
      renderCard([makeSuggestion()])
      expect(screen.getByText('Netflix')).toBeDefined()
    })
  })

  describe('stopping a series', () => {
    it('records the series with the date of its newest charge, and says so with an Undo', () => {
      const showToast = vi.fn<ToastApi['showToast']>()
      renderCard([makeSuggestion()], { showToast })
      fireEvent.click(screen.getByRole('button', { name: 'Stop suggesting Netflix' }))

      expect(JSON.parse(localStorage.getItem(STOPPED_KEY)!)).toEqual({
        'netflix|1|1|expense': { after: '2026-08-24', label: 'Netflix' },
      })
      expect(showToast).toHaveBeenCalledWith(
        'Stopped suggesting Netflix',
        'info',
        expect.objectContaining({ label: 'Undo' }),
      )
    })

    it('is taken back by the Undo', () => {
      const showToast = vi.fn<ToastApi['showToast']>()
      renderCard([makeSuggestion()], { showToast })
      fireEvent.click(screen.getByRole('button', { name: 'Stop suggesting Netflix' }))
      act(() => showToast.mock.calls[0]![2]!.onAction())
      expect(JSON.parse(localStorage.getItem(STOPPED_KEY)!)).toEqual({})
    })

    it('is not the same as dismissing it for the month', () => {
      renderCard([makeSuggestion()])
      fireEvent.click(screen.getByRole('button', { name: 'Stop suggesting Netflix' }))
      expect(localStorage.getItem(DISMISSED_KEY)).toBeNull()
    })

    it('offers the button for every row, named for it', () => {
      renderCard([makeSuggestion({ description: 'Gym' }), makeSuggestion({ description: 'Rent' })])
      expect(screen.getByRole('button', { name: 'Stop suggesting Gym' })).toBeDefined()
      expect(screen.getByRole('button', { name: 'Stop suggesting Rent' })).toBeDefined()
    })
  })

  describe('on a browser that more than one person uses', () => {
    const ALICE = 'alice@example.com'
    const BOB = 'bob@example.com'

    it('keeps a dismissal for the person who made it, and shows the suggestion to the next one', () => {
      const first = renderCard([makeSuggestion()], { owner: ALICE })
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss Netflix' }))
      expect(JSON.parse(localStorage.getItem(`${DISMISSED_KEY}:${ALICE}`)!)).toHaveLength(1)
      expect(localStorage.getItem(DISMISSED_KEY)).toBeNull()
      first.unmount()

      renderCard([makeSuggestion()], { owner: BOB })
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it('hands a person their own dismissals back', () => {
      localStorage.setItem(`${DISMISSED_KEY}:${ALICE}`, JSON.stringify(['Netflix|1|1|expense|2026-09']))
      renderCard([makeSuggestion()], { owner: ALICE })
      expect(screen.queryByText('Netflix')).toBeNull()
    })

    it('keeps a stopped series for the person who stopped it', () => {
      const first = renderCard([makeSuggestion()], { owner: ALICE })
      fireEvent.click(screen.getByRole('button', { name: 'Stop suggesting Netflix' }))
      expect(JSON.parse(localStorage.getItem(`${STOPPED_KEY}:${ALICE}`)!)).toEqual({
        'netflix|1|1|expense': { after: '2026-08-24', label: 'Netflix' },
      })
      expect(localStorage.getItem(STOPPED_KEY)).toBeNull()
      first.unmount()

      renderCard([makeSuggestion()], { owner: BOB })
      expect(screen.getByText('Netflix')).toBeDefined()
    })

    it('does not read what an earlier build kept under the keys that named no one', () => {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(['Netflix|1|1|expense|2026-09']))
      localStorage.setItem(STOPPED_KEY, JSON.stringify({ 'netflix|1|1|expense': { after: '2026-08-24', label: 'Netflix' } }))
      renderCard([makeSuggestion()], { owner: BOB })
      expect(screen.getByText('Netflix')).toBeDefined()
    })
  })
})
