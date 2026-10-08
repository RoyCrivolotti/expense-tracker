import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The fallback popover, as MonthInput.test.tsx does: the native control is the device's own.
vi.mock('../../hooks/isNativeDatePicker', () => ({ isNativeDatePicker: () => false }))

import { EU_MONEY_FORMAT } from '../../../engine'
import { setMotionDisabledForTests } from '../../hooks/motion'
import { MoneyFormatContext } from '../../hooks/moneyFormatContext'
import { ContributionStepsList } from './ContributionSteps'

beforeEach(() => setMotionDisabledForTests(true))
afterEach(() => setMotionDisabledForTests(false))

function setup(overrides: Partial<Parameters<typeof ContributionStepsList>[0]> = {}) {
  const onChange = vi.fn()
  const view = render(
    <MoneyFormatContext.Provider value={EU_MONEY_FORMAT}>
      <ContributionStepsList
        steps={[]}
        planStartDate="2026-06-25"
        baseCents={1_500_00}
        format={EU_MONEY_FORMAT}
        onChange={onChange}
        {...overrides}
      />
    </MoneyFormatContext.Provider>,
  )
  return { onChange, user: userEvent.setup(), ...view }
}

/** Picks a month in the open picker, by the year it shows and the month's button. */
async function pickMonth(user: ReturnType<typeof userEvent.setup>, year: number, month: string) {
  await user.click(screen.getByRole('button', { name: /Change starts in/ }))
  const dialog = screen.getByRole('dialog', { name: 'Choose a month' })
  // The picker opens on the year of the value it holds; step to the year asked for.
  for (let guard = 0; guard < 12 && !within(dialog).queryByText(String(year)); guard++) {
    await user.click(within(dialog).getByRole('button', { name: 'Next year' }))
  }
  await user.click(within(dialog).getByRole('button', { name: `${month} ${year}` }))
}

describe('ContributionStepsList', () => {
  it('lists the changes with their month and amount, each with a way to remove it', async () => {
    const steps = [
      { from: '2027-03', monthlyCents: 2_000_00 },
      { from: '2029-01', monthlyCents: 0 },
    ]
    const { onChange, user } = setup({ steps })

    expect(screen.getByText("from Mar '27")).toBeInTheDocument()
    expect(screen.getByText('2.000,00 €/mo')).toBeInTheDocument()
    expect(screen.getByText("from Jan '29")).toBeInTheDocument()
    expect(screen.getByText('0,00 €/mo')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Remove the change from Mar '27" }))
    expect(onChange).toHaveBeenCalledWith([{ from: '2029-01', monthlyCents: 0 }])
  })

  it('opens a form that starts on the month after the plan starts, and the amount the scenario starts with', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))

    expect(screen.getByRole('button', { name: /Change starts in/ })).toHaveTextContent("Jul '26")
    expect(screen.getByLabelText('Monthly amount from then')).toHaveValue('1.500,00')
    expect(screen.queryByRole('button', { name: '+ Add a change' })).not.toBeInTheDocument()
  })

  it('starts the form from the amount of the last change, which is where the next one is likely to go from', async () => {
    const { user } = setup({ steps: [{ from: '2027-03', monthlyCents: 2_000_00 }] })
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    expect(screen.getByLabelText('Monthly amount from then')).toHaveValue('2.000,00')
  })

  it('adds a change with the month and the amount given, in date order', async () => {
    const { onChange, user } = setup({ steps: [{ from: '2029-01', monthlyCents: 0 }] })
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    await pickMonth(user, 2027, 'Mar')
    const amount = screen.getByLabelText('Monthly amount from then')
    fireEvent.change(amount, { target: { value: '2500' } })
    fireEvent.blur(amount)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith([
      { from: '2027-03', monthlyCents: 2_500_00 },
      { from: '2029-01', monthlyCents: 0 },
    ])
  })

  it('adds a pause, which is a change to nothing', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    const amount = screen.getByLabelText('Monthly amount from then')
    fireEvent.change(amount, { target: { value: '0' } })
    fireEvent.blur(amount)
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onChange).toHaveBeenCalledWith([{ from: '2026-07', monthlyCents: 0 }])
  })

  it('refuses a month that is not after the plan starts, and says how to change the starting amount', async () => {
    const { onChange, user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    await pickMonth(user, 2026, 'Jun')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent(/has to start after the plan starts.*edit Monthly investing/)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a month that already has a change', async () => {
    const { onChange, user } = setup({ steps: [{ from: '2027-03', monthlyCents: 2_000_00 }] })
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    await pickMonth(user, 2027, 'Mar')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent("There is already a change from Mar '27.")
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not scold before the first try, and drops the form on Cancel', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: '+ Add a change' })).toBeInTheDocument()
  })

  it('needs a plan start, and says where to set one, instead of offering a month to count from nothing', () => {
    setup({ planStartDate: null })
    expect(screen.getByText(/Set a plan start date under Plan start/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add a change' })).not.toBeInTheDocument()
  })

  it('still lists, and can remove, a change on a scenario that has lost its plan start', async () => {
    const { onChange, user } = setup({ planStartDate: null, steps: [{ from: '2027-03', monthlyCents: 2_000_00 }] })
    await user.click(screen.getByRole('button', { name: "Remove the change from Mar '27" }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('stops at the limit, and says why', () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({ from: `${2027 + i}-01`, monthlyCents: 1_000_00 }))
    setup({ steps })
    expect(screen.getByRole('button', { name: '+ Add a change' })).toBeDisabled()
    expect(screen.getByText(/can have 10 changes/)).toBeInTheDocument()
  })

  it('wraps December into the January after it for a plan that starts then', async () => {
    const { user } = setup({ planStartDate: '2026-12-10' })
    await user.click(screen.getByRole('button', { name: '+ Add a change' }))
    expect(screen.getByRole('button', { name: /Change starts in/ })).toHaveTextContent("Jan '27")
  })
})
