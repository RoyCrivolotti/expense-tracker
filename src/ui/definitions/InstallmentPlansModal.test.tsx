import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { InstallmentPlan, Transaction } from '../../domain/types'
import type { ExpenseModel } from '../useExpenseData'
import { makeActions } from '../../testing/makeActions'
import { makeDataset, makeLookup, makeTransaction } from '../../testing/factories'
import { InstallmentPlansModal } from './InstallmentPlansModal'
import styles from './InstallmentPlansManager.module.css'

const basePlan: InstallmentPlan = {
  id: 1,
  description: 'Laptop, Boursorama',
  totalCount: 3,
  amountCents: 10_000,
  accountId: 1,
  categoryId: 1,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 1,
  active: true,
}

function installment(index: number, overrides: Partial<Transaction> = {}): Transaction {
  return makeTransaction({
    id: index,
    budgetMonth: `2026-0${index}`,
    planId: basePlan.id,
    installmentIndex: index,
    ...overrides,
  })
}

function modelWith(plans: InstallmentPlan[], transactions: Transaction[] = []): ExpenseModel {
  return {
    dataset: makeDataset({ installmentPlans: plans, transactions }),
    lookup: makeLookup(),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: ['2026-01'],
  }
}

describe('InstallmentPlansModal', () => {
  it('shows an empty state when there are no plans', () => {
    render(
      <InstallmentPlansModal model={modelWith([])} actions={makeActions()} onClose={() => {}} />,
    )
    expect(screen.getByText('No installment plans yet.')).toBeTruthy()
  })

  it('shows progress for a plan with some linked installments', () => {
    render(
      <InstallmentPlansModal
        model={modelWith([basePlan], [installment(1), installment(2)])}
        actions={makeActions()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/2\/3 paid/)).toBeTruthy()
    expect(screen.getByText(/1 remaining/)).toBeTruthy()
    expect(screen.getByText(/Last payment Mar 2026/)).toBeTruthy()
  })

  it('does not append a forecast count when every logged installment has posted', () => {
    render(
      <InstallmentPlansModal
        model={modelWith([basePlan], [installment(1, { status: 'posted' })])}
        actions={makeActions()}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/forecast/)).toBeNull()
  })

  it('counts a logged installment that has not settled as forecast, not paid', () => {
    render(
      <InstallmentPlansModal
        model={modelWith([basePlan], [installment(1, { status: 'forecast' })])}
        actions={makeActions()}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/0\/3 paid · 1 forecast · 2 remaining/)).toBeTruthy()
  })

  it('clicking Complete toggles the plan active flag off', async () => {
    const actions = makeActions()
    render(
      <InstallmentPlansModal model={modelWith([basePlan])} actions={actions} onClose={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Complete' }))
    expect(actions.updateInstallmentPlan).toHaveBeenCalledWith(basePlan.id, { active: false })
  })

  it('clicking Reactivate on an inactive plan toggles it back on', async () => {
    const actions = makeActions()
    const inactivePlan = { ...basePlan, active: false }
    render(
      <InstallmentPlansModal model={modelWith([inactivePlan])} actions={actions} onClose={() => {}} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }))
    expect(actions.updateInstallmentPlan).toHaveBeenCalledWith(inactivePlan.id, { active: true })
  })

  it('renders an inactive plan with the inactive row style', () => {
    const inactivePlan = { ...basePlan, active: false }
    const { container } = render(
      <InstallmentPlansModal
        model={modelWith([inactivePlan])}
        actions={makeActions()}
        onClose={() => {}}
      />,
    )
    const row = container.getElementsByClassName(styles.planRow!)[0]!
    expect(row.className).toContain(styles.inactive!)
  })

  it('renders an active plan without the inactive row style', () => {
    const { container } = render(
      <InstallmentPlansModal model={modelWith([basePlan])} actions={makeActions()} onClose={() => {}} />,
    )
    const row = container.getElementsByClassName(styles.planRow!)[0]!
    expect(row.className).not.toContain(styles.inactive!)
  })
})
