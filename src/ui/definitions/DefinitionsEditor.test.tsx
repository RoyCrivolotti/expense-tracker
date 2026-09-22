import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, Category } from '../../types'
import { makeDataset } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'
import { buildExpenseModel } from '../buildExpenseModel'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { DefinitionsEditor } from './DefinitionsEditor'

const DINING: Category = { id: 1, name: 'Dining', monthlyBudgetCents: 30_000, sortOrder: 0, active: true }
const CHECKING: Account = { id: 10, name: 'Checking', kind: 'debit', settlement: 'immediate', active: true }

function renderEditor() {
  const actions = makeActions()
  const model = buildExpenseModel(makeDataset({ categories: [DINING], accounts: [CHECKING] }))
  render(<DefinitionsEditor model={model} actions={actions} />)
  return actions
}

/** Categories are listed before accounts, so the row Edit buttons come in that order. */
const editCategory = () => screen.getAllByRole('button', { name: 'Edit' })[0]!
const editAccount = () => screen.getAllByRole('button', { name: 'Edit' })[1]!

describe('DefinitionsEditor', () => {
  it('opens a record in the editor from its row, and closes it from Close', async () => {
    renderEditor()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(editCategory())

    expect(screen.getByRole('dialog', { name: 'Edit Dining' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens an account in the editor from its row', async () => {
    renderEditor()

    await userEvent.click(editAccount())

    expect(screen.getByRole('dialog', { name: 'Edit Checking' })).toBeInTheDocument()
  })

  it.each([
    ['+ Add category', 'New category'],
    ['+ Add account', 'New account'],
    ['Edit balances', 'Opening balances'],
    ['Edit goals', 'Goal inputs'],
  ])('opens the right editor from %s', async (button, title) => {
    renderEditor()

    await userEvent.click(screen.getByRole('button', { name: button }))

    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument()
  })

  it('closes the editor once its change is saved', async () => {
    const actions = renderEditor()
    await userEvent.click(editCategory())

    await userEvent.click(screen.getByRole('button', { name: 'Save category' }))

    expect(actions.updateCategory).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Dining' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('DefinitionsEditor leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  it('keeps the editor on screen, out of reach, while it slides down, then removes it', () => {
    renderEditor()
    fireEvent.click(editCategory())

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    const editor = screen.getByRole('dialog', { name: 'Edit Dining' })
    expect(editor.closest('[inert]')).not.toBeNull()

    void act(() => vi.advanceTimersByTime(EXIT_MS.sheet))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
