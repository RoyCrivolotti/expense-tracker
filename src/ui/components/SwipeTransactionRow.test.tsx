import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../../types'
import { makeDataset } from '../../testing/factories'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { buildLookup } from '../format'
import { ToastContext } from '../hooks/useToast'
import { SwipeTransactionRow } from './SwipeTransactionRow'

const lookup = buildLookup(
  makeDataset({
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
  }),
)

const txn: Transaction = {
  id: 7,
  date: '2026-07-15',
  budgetMonth: '2026-07',
  description: 'Market',
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  amountCents: 1200,
  cancelled: false,
  status: 'posted',
}

/** The element that folds: the row's outermost wrapper. */
const foldOf = (container: HTMLElement) => container.firstElementChild as HTMLElement

function renderRow(onDelete: (id: number) => Promise<void>) {
  return render(<SwipeTransactionRow txn={txn} lookup={lookup} showDate={false} onDelete={onDelete} />)
}

/** The row's own Delete action, which sits behind the row until it is swiped and is hidden from AT till then. */
const openConfirm = () => fireEvent.click(screen.getByText('Delete', { selector: 'button' }))

/** Opens the confirm sheet and answers it, without letting any time pass. */
function confirmDelete() {
  openConfirm()
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
}

/** Lets `ms` pass, including the promises that were waiting on it. */
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('SwipeTransactionRow deleting', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('sits at full height until a delete is confirmed', () => {
    const { container } = renderRow(vi.fn().mockResolvedValue(undefined))
    expect(foldOf(container).className).not.toContain('rowFolded')
    expect(foldOf(container).hasAttribute('inert')).toBe(false)
  })

  it('folds away the moment the delete is confirmed, and asks the server once the fold is over', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    const { container } = renderRow(onDelete)

    confirmDelete()

    expect(foldOf(container).className).toContain('rowFolded')
    expect(foldOf(container).hasAttribute('inert')).toBe(true)
    // Not yet: an answer that beat the fold would have the list drop the row halfway down.
    expect(onDelete).not.toHaveBeenCalled()

    await elapse(EXIT_MS.fold - 1)
    expect(onDelete).not.toHaveBeenCalled()

    await elapse(1)
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('does not wait for a fold that will not be animated', async () => {
    setMotionDisabledForTests(true)
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderRow(onDelete)

    confirmDelete()
    await elapse(0)

    expect(onDelete).toHaveBeenCalledWith(7)
  })

  it('unfolds again and says why if the delete fails, because the row is still there', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('offline'))
    const showToast = vi.fn()
    const { container } = render(
      <ToastContext.Provider value={{ showToast }}>
        <SwipeTransactionRow txn={txn} lookup={lookup} showDate={false} onDelete={onDelete} />
      </ToastContext.Provider>,
    )

    confirmDelete()
    await elapse(EXIT_MS.fold)

    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(foldOf(container).className).not.toContain('rowFolded')
    expect(foldOf(container).hasAttribute('inert')).toBe(false)
    expect(showToast).toHaveBeenCalledWith('offline', 'error')
  })

  it('uses a plain message when the failure carries none', async () => {
    const showToast = vi.fn()
    render(
      <ToastContext.Provider value={{ showToast }}>
        <SwipeTransactionRow txn={txn} lookup={lookup} showDate={false} onDelete={vi.fn().mockRejectedValue('nope')} />
      </ToastContext.Provider>,
    )

    confirmDelete()
    await elapse(EXIT_MS.fold)

    expect(showToast).toHaveBeenCalledWith('Could not delete', 'error')
  })

  it('shows its confirm sheet leaving over its own exit when the delete is cancelled, then removes it', () => {
    renderRow(vi.fn().mockResolvedValue(undefined))
    openConfirm()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('SwipeTransactionRow gestures', () => {
  type TouchType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel'

  // A drag's speed decides whether it flings open, so the clock is the test's to set.
  let now = 0
  beforeEach(() => {
    now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })
  /** Lets `ms` pass between two touch events. */
  const wait = (ms: number) => {
    now += ms
  }

  /** jsdom has no TouchEvent constructor; the handlers only read `touches[0]`. */
  function touch(type: TouchType, el: Element, x = 0, y = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    const lifting = type === 'touchend' || type === 'touchcancel'
    Object.defineProperty(event, 'touches', { value: lifting ? [] : [{ clientX: x, clientY: y }] })
    fireEvent(el, event)
  }

  function renderGesturesRow(extra: { onSelect?: (t: Transaction) => void; onLongPressSelect?: (id: number) => void } = {}) {
    const view = render(
      <SwipeTransactionRow
        txn={txn}
        lookup={lookup}
        showDate={false}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onDuplicate={vi.fn()}
        {...extra}
      />,
    )
    const slide = view.container.querySelector<HTMLElement>('[class*="swipeSlide"]')!
    const row = slide.querySelector<HTMLElement>('button')!
    /** Drags left past the point where the actions stay open. */
    const swipeOpen = () => {
      touch('touchstart', slide, 300)
      wait(300)
      touch('touchmove', slide, 100)
      touch('touchend', slide)
    }
    return { slide, row, swipeOpen }
  }

  /** Whether the Copy and Delete actions behind the row are exposed to touch and screen readers. */
  const actionsOpen = () => screen.queryByRole('button', { name: 'Delete' }) !== null

  it('selects the row when it is tapped', () => {
    const onSelect = vi.fn()
    const { row } = renderGesturesRow({ onSelect })

    fireEvent.click(row)

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(txn)
  })

  it('keeps its actions behind the row until it is swiped left', () => {
    const { swipeOpen } = renderGesturesRow()
    expect(actionsOpen()).toBe(false)

    swipeOpen()

    expect(actionsOpen()).toBe(true)
  })

  it('does not select the row for the tap that ends a swipe, and closes it on the next tap', () => {
    const onSelect = vi.fn()
    const { row, swipeOpen } = renderGesturesRow({ onSelect })
    swipeOpen()

    // The click a finger lifting off after a drag produces belongs to the swipe.
    fireEvent.click(row)
    expect(onSelect).not.toHaveBeenCalled()
    expect(actionsOpen()).toBe(true)

    // A deliberate tap on an open row closes it rather than opening the transaction.
    fireEvent.click(row)
    expect(onSelect).not.toHaveBeenCalled()
    expect(actionsOpen()).toBe(false)

    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(txn)
  })

  it('puts the row back when the touch is cancelled part way', () => {
    const { slide } = renderGesturesRow()

    touch('touchstart', slide, 300)
    wait(300)
    touch('touchmove', slide, 260)
    touch('touchcancel', slide)

    expect(actionsOpen()).toBe(false)
  })

  it('leaves a short drag closed', () => {
    const { slide } = renderGesturesRow()

    touch('touchstart', slide, 300)
    wait(300)
    touch('touchmove', slide, 280)
    touch('touchend', slide)

    expect(actionsOpen()).toBe(false)
  })

  it('selects the row for a long press, the way select mode is entered on a phone', () => {
    vi.useFakeTimers()
    try {
      const onLongPressSelect = vi.fn()
      const { slide } = renderGesturesRow({ onLongPressSelect })

      touch('touchstart', slide, 100, 100)
      act(() => {
        vi.advanceTimersByTime(500)
      })

      expect(onLongPressSelect).toHaveBeenCalledExactlyOnceWith(7)
    } finally {
      vi.useRealTimers()
    }
  })
})
