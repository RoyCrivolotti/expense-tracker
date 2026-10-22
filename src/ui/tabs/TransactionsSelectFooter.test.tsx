import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { buildExpenseModel } from '../buildExpenseModel'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { TransactionsSelectFooter } from './TransactionsSelectFooter'

type Props = ComponentProps<typeof TransactionsSelectFooter>
type SelectionState = Props['selection']

const VISIBLE = [1, 2, 3, 4, 5]

const MODEL = buildExpenseModel(
  makeDataset({
    categories: [{ id: 1, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    accounts: [{ id: 10, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }],
  }),
)

/** Three of the five visible rows chosen, select mode on, nothing pending. */
function makeSelection(overrides: Partial<SelectionState> = {}): SelectionState {
  const selected = overrides.selected ?? new Set([1, 2, 3])
  return {
    selectMode: true,
    selected,
    selectedCount: selected.size,
    allMatching: null,
    matchingOffer: null,
    selectMatching: vi.fn(),
    hiddenCount: 0,
    busy: false,
    pendingBatchDelete: false,
    pendingBulkEdit: false,
    toggleSelectMode: vi.fn(),
    selectAll: vi.fn(),
    deselectAll: vi.fn(),
    requestBatchDelete: vi.fn(),
    cancelBatchDelete: vi.fn(),
    confirmBatchDelete: vi.fn().mockResolvedValue(undefined),
    requestBulkEdit: vi.fn(),
    cancelBulkEdit: vi.fn(),
    confirmBulkEdit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function footer(selection: SelectionState, props: Partial<Props> = {}) {
  return (
    <TransactionsSelectFooter
      actionsEnabled
      selection={selection}
      visibleIds={VISIBLE}
      rows={MODEL.dataset.transactions}
      model={MODEL}
      {...props}
    />
  )
}

/** The bar has a Delete button of its own, so the confirm's has to be found inside it. */
const confirmSheet = () => within(screen.getByRole('alertdialog'))

describe('TransactionsSelectFooter selection bar', () => {
  it('says how many rows are chosen, and how many the filter hides', () => {
    render(footer(makeSelection({ hiddenCount: 2 })))

    expect(screen.getByText('3 selected')).toBeInTheDocument()
    expect(screen.getByText('2 not shown')).toBeInTheDocument()
  })

  it('hands each of its controls to the selection', async () => {
    const selection = makeSelection()
    render(footer(selection))

    await userEvent.click(screen.getByRole('button', { name: 'Select all' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Exit selection mode' }))

    expect(selection.selectAll).toHaveBeenCalledWith(VISIBLE)
    expect(selection.requestBulkEdit).toHaveBeenCalledTimes(1)
    expect(selection.requestBatchDelete).toHaveBeenCalledTimes(1)
    expect(selection.toggleSelectMode).toHaveBeenCalledTimes(1)
  })

  it('deselects instead once every visible row is chosen', async () => {
    const selection = makeSelection({ selected: new Set(VISIBLE) })
    render(footer(selection))

    await userEvent.click(screen.getByRole('button', { name: 'Deselect all' }))

    expect(selection.deselectAll).toHaveBeenCalledTimes(1)
    expect(selection.selectAll).not.toHaveBeenCalled()
  })

  it('is gone when select mode is off', () => {
    render(footer(makeSelection({ selectMode: false })))

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('still offers a way out without write access, but nothing to act with', async () => {
    const selection = makeSelection()
    render(footer(selection, { actionsEnabled: false }))

    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Exit selection mode' }))

    expect(selection.toggleSelectMode).toHaveBeenCalledTimes(1)
  })
})

describe('TransactionsSelectFooter, every row the filter matches', () => {
  const target = { filter: { categoryId: 4 }, expectedCount: 342, expectedRevision: 'r9' }
  const all = new Set(VISIBLE)

  it('goes on from the rows the list holds to all that match, once those are all selected and more match', async () => {
    const selection = makeSelection({ selected: all, matchingOffer: target })
    render(footer(selection, { partial: true }))

    await userEvent.click(screen.getByRole('button', { name: 'Select all 342' }))

    expect(selection.selectMatching).toHaveBeenCalledTimes(1)
    expect(selection.deselectAll).not.toHaveBeenCalled()
  })

  it.each([
    ['some of the rows the list holds are not selected', { selected: new Set([1, 2]) }, true],
    ['the list holds every row there is', { selected: all }, false],
  ])('does not offer them when %s', (_name, overrides, partial) => {
    render(footer(makeSelection({ ...overrides, matchingOffer: target }), { partial }))

    expect(screen.queryByRole('button', { name: 'Select all 342' })).toBeNull()
  })

  it('does not offer them when no more match than the list holds', () => {
    render(footer(makeSelection({ selected: all, matchingOffer: { ...target, expectedCount: VISIBLE.length } }), { partial: true }))

    expect(screen.queryByRole('button', { name: /^Select all \d+$/ })).toBeNull()
  })

  it('counts them, offers no delete, and lets go of them with one press', async () => {
    const selection = makeSelection({ selected: all, selectedCount: 342, allMatching: target, matchingOffer: target, hiddenCount: 4 })
    render(footer(selection, { partial: true }))

    expect(screen.getByText('342 selected')).toBeInTheDocument()
    expect(screen.getByText('edit only')).toBeInTheDocument()
    expect(screen.queryByText(/not shown/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Deselect all' }))
    expect(selection.deselectAll).toHaveBeenCalledTimes(1)
  })

  it('edits them as that many transactions, with no hidden rows and nothing to say a rename replaces', async () => {
    const selection = makeSelection({
      selected: all,
      selectedCount: 342,
      allMatching: target,
      pendingBulkEdit: true,
      hiddenCount: 4,
    })
    render(footer(selection, { rows: [makeTransaction({ id: 1, description: 'NETFLIX.COM' })] }))

    expect(screen.getByText('342 transactions')).toBeInTheDocument()
    expect(screen.queryByRole('note')).toBeNull()
    await userEvent.click(screen.getByLabelText('Description'))
    expect(screen.queryByText(/^Replaces/)).toBeNull()
  })
})

describe('TransactionsSelectFooter delete confirm', () => {
  it('asks first, and says how many rows go', () => {
    render(footer(makeSelection({ pendingBatchDelete: true })))

    expect(screen.getByRole('alertdialog', { name: 'Delete transactions?' })).toHaveTextContent(
      '3 transactions will be removed permanently.',
    )
  })

  it('says how many chosen rows it leaves alone', () => {
    render(footer(makeSelection({ pendingBatchDelete: true, hiddenCount: 2 })))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "2 more you selected aren't shown and won't be deleted.",
    )
  })

  it('deletes the selection when confirmed', async () => {
    const selection = makeSelection({ pendingBatchDelete: true })
    render(footer(selection))

    await userEvent.click(confirmSheet().getByRole('button', { name: 'Delete' }))

    expect(selection.confirmBatchDelete).toHaveBeenCalledTimes(1)
    expect(selection.cancelBatchDelete).not.toHaveBeenCalled()
  })

  it('backs out on Cancel without deleting anything', async () => {
    const selection = makeSelection({ pendingBatchDelete: true })
    render(footer(selection))

    await userEvent.click(confirmSheet().getByRole('button', { name: 'Cancel' }))

    expect(selection.cancelBatchDelete).toHaveBeenCalledTimes(1)
    expect(selection.confirmBatchDelete).not.toHaveBeenCalled()
  })

  it('stays closed until asked for', () => {
    render(footer(makeSelection()))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('is not offered without write access', () => {
    render(footer(makeSelection({ pendingBatchDelete: true }), { actionsEnabled: false }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('TransactionsSelectFooter bulk edit', () => {
  it('opens the edit sheet for the chosen rows', () => {
    render(footer(makeSelection({ pendingBulkEdit: true })))

    expect(screen.getByRole('dialog', { name: 'Edit selected' })).toBeInTheDocument()
    expect(screen.getByText('3 transactions')).toBeInTheDocument()
  })

  it('says how many chosen rows it leaves alone', () => {
    render(footer(makeSelection({ pendingBulkEdit: true, hiddenCount: 1 })))

    expect(screen.getByRole('note')).toHaveTextContent(
      "1 more you selected isn't shown and won't be changed.",
    )
  })

  it('applies only the fields that were switched on', async () => {
    const selection = makeSelection({ pendingBulkEdit: true })
    render(footer(selection))

    await userEvent.click(screen.getByLabelText('Category'))
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(selection.confirmBulkEdit).toHaveBeenCalledWith({ categoryId: 1 }, [])
  })

  it('threads chosen labels through as the second argument, never into the patch', async () => {
    const model = buildExpenseModel(
      makeDataset({
        labels: [{ id: 3, name: 'Madrid trip', color: '#6366f1', sortOrder: 0, active: true }],
      }),
    )
    const selection = makeSelection({ pendingBulkEdit: true })
    render(footer(selection, { model }))

    await userEvent.click(screen.getByLabelText('Labels'))
    await userEvent.click(screen.getByRole('button', { name: 'No labels' }))
    await userEvent.click(screen.getByRole('button', { name: 'Madrid trip' }))
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await userEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(selection.confirmBulkEdit).toHaveBeenCalledWith({}, [3])
  })

  it('tells the rename field which descriptions the chosen rows carry today', async () => {
    const model = buildExpenseModel(
      makeDataset({
        transactions: [
          makeTransaction({ id: 1, description: 'NETFLIX.COM' }),
          makeTransaction({ id: 2, description: 'NETFLIX.COM' }),
          makeTransaction({ id: 3, description: 'Netflix 0912' }),
          makeTransaction({ id: 4, description: 'Rent' }),
        ],
      }),
    )
    const selection = makeSelection({ pendingBulkEdit: true, selected: new Set([1, 2, 3]) })
    render(footer(selection, { model, rows: model.dataset.transactions }))

    await userEvent.click(screen.getByLabelText('Description'))

    // Row 4 is not chosen, so Rent is not on the list.
    expect(screen.getByText('Replaces NETFLIX.COM (2), Netflix 0912 (1).')).toBeInTheDocument()
  })

  it('backs out on Cancel without applying anything', async () => {
    const selection = makeSelection({ pendingBulkEdit: true })
    render(footer(selection))

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(selection.cancelBulkEdit).toHaveBeenCalledTimes(1)
    expect(selection.confirmBulkEdit).not.toHaveBeenCalled()
  })

  it('lets a flag be made in place when it has the actions to do it', async () => {
    render(footer(makeSelection({ pendingBulkEdit: true }), { actions: makeActions() }))

    await userEvent.click(screen.getByLabelText('Flag'))
    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))

    expect(screen.getByRole('button', { name: '+ New flag' })).toBeInTheDocument()
  })

  it('stays closed until asked for', () => {
    render(footer(makeSelection()))

    expect(screen.queryByRole('dialog', { name: 'Edit selected' })).not.toBeInTheDocument()
  })

  it('is not offered without write access', () => {
    render(footer(makeSelection({ pendingBulkEdit: true }), { actionsEnabled: false }))

    expect(screen.queryByRole('dialog', { name: 'Edit selected' })).not.toBeInTheDocument()
  })
})

describe('TransactionsSelectFooter leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps the count on the bar while it slides away, rather than reading "0 selected"', () => {
    const { rerender } = render(footer(makeSelection()))

    // Deleting ends select mode and empties the selection in the same update.
    rerender(footer(makeSelection({ selectMode: false, selected: new Set() })))

    expect(screen.getByText('3 selected')).toBeInTheDocument()

    void act(() => vi.advanceTimersByTime(EXIT_MS.bar))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('keeps the count on the confirm sheet while it leaves', () => {
    const { rerender } = render(footer(makeSelection({ pendingBatchDelete: true })))

    rerender(footer(makeSelection({ selected: new Set() })))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '3 transactions will be removed permanently.',
    )

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
