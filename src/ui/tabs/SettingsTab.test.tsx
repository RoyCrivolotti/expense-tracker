import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsTab } from './SettingsTab'
import { buildExpenseModel } from '../buildExpenseModel'
import { makeDataset } from '../../testing/factories'
import { makeActions } from '../../testing/makeActions'

describe('SettingsTab', () => {
  it('saves the investments category and the default account through the actions', () => {
    const actions = makeActions()
    const model = buildExpenseModel(
      makeDataset({
        accounts: [
          { id: 1, name: 'Main', kind: 'debit', settlement: 'immediate', active: true },
          { id: 2, name: 'Card', kind: 'credit', settlement: 'deferred', active: true },
        ],
        categories: [
          { id: 5, name: 'Groceries', monthlyBudgetCents: 0, sortOrder: 0, active: true },
          { id: 6, name: 'ETFs', monthlyBudgetCents: 0, sortOrder: 1, active: true },
        ],
      }),
    )
    render(<SettingsTab model={model} month="2026-09" actions={actions} theme="dark" onThemeChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Category for investments'), { target: { value: '6' } })
    expect(actions.updateSettings).toHaveBeenLastCalledWith({ investmentCategoryId: 6 })
    fireEvent.change(screen.getByLabelText('Default account'), { target: { value: '2' } })
    expect(actions.updateSettings).toHaveBeenLastCalledWith({ defaultAccountId: 2 })
  })
})

describe('SettingsTab sections', () => {
  function renderSettings() {
    const model = buildExpenseModel(makeDataset())
    return render(
      <SettingsTab model={model} month="2026-09" actions={makeActions()} theme="dark" onThemeChange={vi.fn()} />,
    )
  }

  it('offers Preferences, Setup, Account and Data as tabs over one panel, opening on Preferences', () => {
    renderSettings()

    expect(screen.getByRole('tablist', { name: 'Settings section' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Preferences', 'Setup', 'Account', 'Data'])
    expect(screen.getByRole('tab', { name: 'Preferences' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Preferences')
    expect(screen.getByLabelText('Default account')).toBeInTheDocument()
  })

  it('swaps the panel for the section that is tapped', () => {
    renderSettings()

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }))

    expect(screen.getByRole('tab', { name: 'Data' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Data')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Export')
    expect(screen.queryByLabelText('Default account')).not.toBeInTheDocument()
  })
})
