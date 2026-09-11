import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useIsNativeDatePicker', () => ({ useIsNativeDatePicker: () => true }))

import { DateField } from './goalControlFields'

describe('DateField', () => {
  it('renders with a null value showing empty input', () => {
    render(<DateField label="Plan start date" value={null} onChange={vi.fn()} />)
    const input = screen.getByLabelText('Plan start date')
    expect(input).toHaveValue('')
  })

  it('renders with an existing date value', () => {
    render(<DateField label="Plan start date" value="2024-01-15" onChange={vi.fn()} />)
    const input = screen.getByLabelText('Plan start date')
    expect(input).toHaveValue('2024-01-15')
  })

  it('calls onChange with the new date string when changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField label="Plan start date" value={null} onChange={onChange} />)
    const input = screen.getByLabelText('Plan start date')
    await user.type(input, '2024-06-01')
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange with null when date is cleared', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<DateField label="Plan start date" value="2024-01-15" onChange={onChange} />)
    const input = screen.getByLabelText('Plan start date')
    await user.clear(input)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('renders an optional hint', () => {
    render(
      <DateField
        label="Plan start date"
        value={null}
        hint="Anchors the projection to a date."
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Anchors the projection to a date.')).toBeInTheDocument()
  })
})
