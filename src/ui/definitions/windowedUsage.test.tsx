/**
 * The Settings screens over a model that holds a window: what names a record is the server's count, which says more than the
 * rows held and takes time. A count that is not known is never shown as zero and never decides a delete.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Usage } from '../../domain/data/usage'
import type { ExpenseActions } from '../actions'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset, makeFlag, makeLabel } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import type { ExpenseModel } from '../useExpenseData'
import { ConfigModal } from './ConfigModal'
import { FlagList } from './FlagList'
import { FlagsModal } from './FlagsModal'
import { LabelList } from './LabelList'
import { LabelsModal } from './LabelsModal'
import { usageCount } from '../ledgerUsage'
import { NOTE_WORDS } from '../ledgerUsageWords'
import { UsageNote } from '../ledgerUsageNote'
import type { UsageView } from './recordUsage'

const DINING = { id: 1, name: 'Dining', monthlyBudgetCents: 0, sortOrder: 0, active: true }
const GROCERIES = { id: 2, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 1, active: true }
const CHECKING = { id: 10, name: 'Checking', kind: 'debit' as const, settlement: 'immediate' as const, active: true }
const CARD = { id: 11, name: 'Card', kind: 'credit' as const, settlement: 'deferred' as const, active: true }
const work = makeFlag({ id: 1, name: 'Work travel' })
const trip = makeLabel({ id: 4, name: 'Trip' })

/** What the server counted, for rows the model does not hold: none of the ledger's rows are in it. */
const counted: Usage = {
  categories: [
    { id: 1, transactions: 0, plans: 0 },
    { id: 2, transactions: 3, plans: 1 },
  ],
  accounts: [
    { id: 10, transactions: 0, plans: 0, statements: 0 },
    { id: 11, transactions: 5, plans: 0, statements: 2 },
  ],
  flags: [{ id: 1, transactions: 7 }],
  labels: [{ id: 4, transactions: 9 }],
}

/** What the model says of the counts: `usage` null is none read yet, and `note` is why they cannot be taken as they are. */
function windowOf({ usage = counted, note = null, refresh = vi.fn(), empty = false }: { usage?: Usage | null; note?: UsageView['note']; refresh?: () => void; empty?: boolean } = {}): ExpenseModel {
  const dataset = makeDataset({ categories: [DINING, GROCERIES], accounts: [CHECKING, CARD], flags: empty ? [] : [work], labels: empty ? [] : [trip] })
  const view: UsageView = {
    count: (kind, id) => (usage === null ? null : usageCount(usage, kind, id)),
    note,
    notice: note === null ? null : <UsageNote note={note} refresh={refresh} />,
    words: note === null ? null : NOTE_WORDS[note],
  }
  return { ...buildExpenseModel(dataset), useUsage: () => view }
}

const actions = { deleteCategory: vi.fn(), deleteAccount: vi.fn(), deleteFlag: vi.fn(), deleteLabel: vi.fn() } as unknown as ExpenseActions

const inSettings = (ui: React.ReactElement) => render(<MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">{ui}</MoneyFormatProvider>)

describe('deleting a category or account from a window', () => {
  it('asks to reassign when the server counts rows that are not held, which the window shows as none', () => {
    render(<ConfigModal target={{ kind: 'category', record: GROCERIES }} model={windowOf({})} actions={actions} onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))

    expect(screen.getByText(/used by 4 records/)).toBeTruthy()
    expect(screen.queryByText("This can't be undone.")).toBeNull()
  })

  it('counts statements for an account too, and deletes outright one the server counts nothing for', () => {
    render(<ConfigModal target={{ kind: 'account', record: CARD }} model={windowOf({})} actions={actions} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    expect(screen.getByText(/used by 7 records/)).toBeTruthy()
  })

  it('deletes outright what the server counts nothing for', () => {
    render(<ConfigModal target={{ kind: 'category', record: DINING }} model={windowOf({})} actions={actions} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText("This can't be undone.")).toBeTruthy()
  })

  it.each([
    ['category', GROCERIES],
    ['account', CARD],
  ] as const)('cannot be asked of a %s while the counts are being read, and says they are', (kind, record) => {
    render(
      <ConfigModal target={{ kind, record } as never} model={windowOf({ usage: null, note: 'reading' })} actions={actions} onClose={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: `Delete ${kind}` })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Reading the counts…')
  })

  it('leaves the server to decide when the counts could not be read, offers to read them again, and does not call it unused', () => {
    const refresh = vi.fn()
    render(
      <ConfigModal
        target={{ kind: 'category', record: GROCERIES }}
        model={windowOf({ usage: null, note: 'failed', refresh })}
        actions={actions}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read the counts.")
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refresh).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText("This can't be undone.")).toBeTruthy()
    expect(within(screen.getByRole('alertdialog')).getByText("Couldn't read the counts.")).toBeInTheDocument()
  })

  it('goes by the counts it has while they may be out of date, and says so', () => {
    render(<ConfigModal target={{ kind: 'category', record: GROCERIES }} model={windowOf({ note: 'stale' })} actions={actions} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('The counts may be out of date.')
    fireEvent.click(screen.getByRole('button', { name: 'Delete category' }))
    expect(screen.getByText(/used by 4 records/)).toBeTruthy()
  })
})

describe('the flag and label lists over a window', () => {
  it('show the server’s counts and not the rows held', () => {
    inSettings(<FlagList model={windowOf({})} actions={actions} />)
    expect(screen.getByText(/7 tagged/)).toBeInTheDocument()
    inSettings(<LabelList model={windowOf({})} actions={actions} />)
    expect(screen.getByText(/9 tagged/)).toBeInTheDocument()
  })

  it('show a dash and say the counts are being read, never zero', () => {
    inSettings(<FlagList model={windowOf({ usage: null, note: 'reading' })} actions={actions} />)
    expect(screen.getByText(/— tagged/)).toBeInTheDocument()
    expect(screen.queryByText(/\b0 tagged/)).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Reading the counts…')
  })

  it('keep the counts they have, say they may be out of date, and read again on request', async () => {
    const refresh = vi.fn()
    inSettings(<LabelList model={windowOf({ note: 'stale', refresh })} actions={actions} />)
    expect(screen.getByText(/9 tagged/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Read again' }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

describe('the flag and label managers over a window', () => {
  it('list the server’s counts, and a dash while there are none', () => {
    inSettings(<FlagsModal model={windowOf({})} actions={actions} onClose={vi.fn()} />)
    expect(screen.getByText(/7 transactions/)).toBeInTheDocument()
    inSettings(<LabelsModal model={windowOf({ usage: null, note: 'failed' })} actions={actions} onClose={vi.fn()} />)
    expect(screen.getByText(/—/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read the counts.")
  })

  it.each([
    ['reading', null],
    ['failed', null],
    ['stale', counted],
  ] as const)('keep the delete of a flag or label shut while the counts are %s, and say so', async (note, usage) => {
    for (const [Modal, kind] of [[FlagsModal, 'flag'], [LabelsModal, 'label']] as const) {
      const shown = inSettings(<Modal model={windowOf({ usage, note })} actions={actions} onClose={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
      expect(screen.getByRole('button', { name: `Delete ${kind}` })).toBeDisabled()
      expect(screen.getByText(NOTE_WORDS[note])).toBeInTheDocument()
      shown.unmount()
    }
  })

  it('open the delete of a flag or label once the counts can be taken, and tell the number', async () => {
    inSettings(<FlagsModal model={windowOf({})} actions={actions} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete flag' }))
    expect(screen.getByText(/7 transactions will be unflagged/)).toBeInTheDocument()
    expect(screen.queryByText(NOTE_WORDS.stale)).toBeNull()
  })

  it.each([
    ['flag', FlagsModal, /Every transaction flagged with it will be unflagged/, /7 transactions/],
    ['label', LabelsModal, /Every transaction with this label will lose it/, /9 transactions/],
  ] as const)('say it without a number, and with the note, when the counts of a %s stop being current while the sheet is open', async (kind, Modal, generic, number) => {
    const wrap = (model: ExpenseModel) => (
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <Modal model={model} actions={actions} onClose={vi.fn()} />
      </MoneyFormatProvider>
    )
    const shown = render(wrap(windowOf({})))
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: `Delete ${kind}` }))
    expect(within(screen.getByRole('alertdialog')).getByText(number)).toBeInTheDocument()

    shown.rerender(wrap(windowOf({ note: 'stale' })))

    const sheet = within(screen.getByRole('alertdialog'))
    expect(sheet.getByText(generic)).toBeInTheDocument()
    expect(sheet.getByText(NOTE_WORDS.stale)).toBeInTheDocument()
    expect(sheet.queryByText(number)).toBeNull()
  })
})

describe('the notice about the counts, when there is nothing to count or to touch', () => {
  it.each([
    ['flags', FlagsModal],
    ['labels', LabelsModal],
  ] as const)('is not shown over an empty list of %s, which has no counts to wait for', (_name, Modal) => {
    inSettings(<Modal model={windowOf({ usage: null, note: 'reading', empty: true })} actions={actions} onClose={vi.fn()} />)
    expect(screen.queryByText('Reading the counts…')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it.each([
    ['flags', FlagsModal],
    ['labels', LabelsModal],
  ] as const)('is still shown over a list of %s that has some', (_name, Modal) => {
    inSettings(<Modal model={windowOf({ usage: null, note: 'reading' })} actions={actions} onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Reading the counts…')
  })

  it.each([
    ['failed', 'Try again'],
    ['stale', 'Read again'],
  ] as const)('has a "%s" link to %s at least 44px high, though it reads as a link in a line of text', (note, label) => {
    inSettings(<LabelsModal model={windowOf({ note })} actions={actions} onClose={vi.fn()} />)
    expect(getComputedStyle(screen.getByRole('button', { name: label })).minHeight).toBe('44px')
  })
})
