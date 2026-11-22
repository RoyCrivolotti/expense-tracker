import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { allGroupsGranted } from '../../domain/accessGroups'
import { makeTransaction } from '../../testing/factories'
import { ExpensesApp } from '../ExpensesApp'
import { ToastProvider } from '../hooks/ToastProvider'
import { setMotionDisabledForTests } from '../hooks/motion'
import { card, dashboardReady, hide, open, sourceFor, storeWith, writesOf } from './tipsHarness'

/** What each line of the checklist says, with the words a screen reader gets for its tick. */
const lines = () =>
  within(card()!)
    .getAllByRole('listitem')
    .map((li) => li.textContent.replace('✓', '').replace(/\s+/g, ' ').trim())

describe('the Getting started card and what is remembered on the account', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('shows to a new person (an empty list), and hiding it saves the list on the account', async () => {
    const store = storeWith({ tipsSeen: [] })
    const source = sourceFor(store)
    open(source)
    await dashboardReady()
    expect(card()).toBeInTheDocument()

    hide()

    expect(card()).toBeNull()
    expect(writesOf(source)).toHaveBeenCalledWith({ tipsSeen: ['getting-started'] })
    await waitFor(() => expect(store.settings.tipsSeen).toEqual(['getting-started']))
  })

  it('does not show to an established account: no list saved, and payments in it, so nothing is backfilled', async () => {
    open(sourceFor(storeWith()))
    await dashboardReady()
    expect(card()).toBeNull()
  })

  it('shows to a new account with no list and no payments yet', async () => {
    open(sourceFor(storeWith(), []))
    await screen.findByText('Budgets')
    expect(card()).toBeInTheDocument()
  })

  it('stays gone on another device and after a reload, because it is saved on the account', async () => {
    const store = storeWith({ tipsSeen: [] })
    const first = open(sourceFor(store))
    await dashboardReady()
    hide()
    await waitFor(() => expect(store.settings.tipsSeen).toEqual(['getting-started']))
    first.unmount()

    open(sourceFor(store))
    await dashboardReady()

    expect(card()).toBeNull()
  })

  it('is kept per person: one person hiding it does not hide it from another on the same browser, and the browser keeps nothing', async () => {
    const mine = storeWith({ tipsSeen: [] })
    const theirs = storeWith({ tipsSeen: [] })
    const first = open(sourceFor(mine), 'one@example.com')
    await dashboardReady()
    hide()
    await waitFor(() => expect(mine.settings.tipsSeen).toEqual(['getting-started']))
    first.unmount()

    open(sourceFor(theirs), 'two@example.com')
    await dashboardReady()

    expect(card()).toBeInTheDocument()
    expect(theirs.settings.tipsSeen).toEqual([])
    expect(Object.keys(localStorage).filter((key) => key.includes('tip'))).toEqual([])
  })

  it('does not carry what one person put away this visit over to the next when the app switches owner without being unmounted', async () => {
    // The save fails, so the account still lists nothing and only this visit's own memory hides the card.
    const source = sourceFor(storeWith({ tipsSeen: [] }, true))
    const view = open(source, 'one@example.com')
    await dashboardReady()
    hide()
    expect(card()).toBeNull()

    view.rerender(
      <ToastProvider>
        <ExpensesApp source={source} hubGrants={allGroupsGranted()} accountEmail="two@example.com" />
      </ToastProvider>,
    )

    expect(await screen.findByRole('region', { name: 'Getting started' })).toBeInTheDocument()
  })

  it('stays gone for the visit when the save fails, and comes back on the next load', async () => {
    const store = storeWith({ tipsSeen: [] }, true)
    const first = open(sourceFor(store))
    await dashboardReady()

    hide()

    expect(card()).toBeNull()
    await act(() => Promise.resolve())
    expect(card()).toBeNull()
    first.unmount()
    open(sourceFor(store))
    await dashboardReady()
    expect(card()).toBeInTheDocument()
  })

  it('shows nothing where nothing can be acted on', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), [makeTransaction()], false))
    await dashboardReady()
    expect(card()).toBeNull()
  })

  it('ticks what is done and leaves the rest to do', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), []))
    await screen.findByText('Budgets')
    expect(lines()).toContain('Done: Set up your categories and accounts')
    expect(lines()).toContain('To do: Add your first payment Add a payment')
    expect(lines()).toContain('To do: Bring in older payments Open Import')
  })

  it('shows a first payment as done once there is one, and older payments as still to do with one month', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await screen.findByText('Budgets')
    expect(lines()).toContain('Done: Add your first payment')
    expect(lines()).toContain('To do: Bring in older payments Open Import')
  })

  it('leaves by itself, and is saved as put away, once every line is done', async () => {
    const feb = makeTransaction({ id: 2, date: '2025-02-15', budgetMonth: '2025-02' })
    const store = storeWith({ tipsSeen: [] })
    const source = sourceFor(store, [makeTransaction(), feb])
    open(source)
    await dashboardReady()

    await waitFor(() => expect(card()).toBeNull())
    expect(store.settings.tipsSeen).toEqual(['getting-started'])
    expect(writesOf(source)).toHaveBeenCalledTimes(1)
  })

  it('stays while a line is still to do', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    await act(() => Promise.resolve())
    expect(card()).toBeInTheDocument()
  })

  it('lists what is done and offers the first payment and Import, which opens Settings on Data', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] }), []))
    await screen.findByText('Budgets')

    expect(screen.getByRole('button', { name: 'Add a payment' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Import' }))

    expect(await screen.findByRole('tab', { name: 'Data', selected: true })).toBeInTheDocument()
    expect(screen.getByText('Import')).toBeInTheDocument()
  })
})

describe('the Home Screen line', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
  beforeEach(() => setMotionDisabledForTests(true))
  afterEach(() => vi.restoreAllMocks())

  function readingAs(userAgent: string, standalone: boolean) {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent)
    vi.mocked(window.matchMedia).mockImplementation(
      (query: string) => ({ matches: standalone && query.includes('standalone'), media: query }) as MediaQueryList,
    )
  }

  it('shows in a phone browser', async () => {
    readingAs(IPHONE, false)
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument()
  })

  it('never shows in the installed app, which Safari reports by its own flag when the display mode does not', async () => {
    readingAs(IPHONE, false)
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true })
    try {
      open(sourceFor(storeWith({ tipsSeen: [] })))
      await dashboardReady()
      expect(card()).toBeInTheDocument()
      expect(screen.queryByText(/Home Screen/)).toBeNull()
    } finally {
      Reflect.deleteProperty(window.navigator, 'standalone')
    }
  })

  it('never shows in the installed app', async () => {
    readingAs(IPHONE, true)
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    expect(card()).toBeInTheDocument()
    expect(screen.queryByText(/Home Screen/)).toBeNull()
  })

  it('never shows on a computer', async () => {
    readingAs(DESKTOP, false)
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    expect(screen.queryByText(/Home Screen/)).toBeNull()
  })
})
