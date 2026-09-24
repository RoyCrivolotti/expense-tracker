import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DefaultAccountSetting } from './DefaultAccountSetting'
import { defaultExpenseSettings } from '../../engine'
import type { Account, Category } from '../../types'

const accounts: Account[] = [
  { id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
]
const categories: Category[] = [
  { id: 5, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
  { id: 6, name: 'Investments', monthlyBudgetCents: 0, sortOrder: 1, active: true },
  { id: 7, name: 'Old', monthlyBudgetCents: 0, sortOrder: 2, active: false },
]

describe('DefaultAccountSetting', () => {
  it('saves the default account and the investments category as settings patches', () => {
    const onChange = vi.fn()
    render(
      <DefaultAccountSetting accounts={accounts} categories={categories} settings={defaultExpenseSettings()} onChange={onChange} />,
    )
    fireEvent.change(screen.getByLabelText('Default account'), { target: { value: '2' } })
    expect(onChange).toHaveBeenLastCalledWith({ defaultAccountId: 2 })

    // With nothing chosen the category named for investments is already selected.
    const investments = screen.getByLabelText('Category for investments')
    expect(investments).toHaveValue('6')
    fireEvent.change(investments, { target: { value: '5' } })
    expect(onChange).toHaveBeenLastCalledWith({ investmentCategoryId: 5 })
    fireEvent.change(investments, { target: { value: '' } })
    expect(onChange).toHaveBeenLastCalledWith({ investmentCategoryId: null })
    // An archived category is not on offer.
    expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument()
  })
})
