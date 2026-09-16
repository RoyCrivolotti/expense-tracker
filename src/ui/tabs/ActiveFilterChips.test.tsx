import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActiveFilterChips } from './ActiveFilterChips'

describe('ActiveFilterChips', () => {
  it('clears its filter when tapped', async () => {
    const onClear = vi.fn()
    render(<ActiveFilterChips chips={[{ key: 'scope', label: 'Dates: last 3 months', onClear }]} />)

    await userEvent.click(screen.getByRole('button', { name: /Dates: last 3 months/ }))

    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('does nothing while rows are being selected', async () => {
    // Clearing the date scope narrows the list back to one month, which would hide rows
    // that are already chosen, and the filters are locked so it could not be undone.
    const onClear = vi.fn()
    render(
      <ActiveFilterChips chips={[{ key: 'scope', label: 'Dates: last 3 months', onClear }]} disabled />,
    )
    const chip = screen.getByRole('button', { name: /Dates: last 3 months/ })

    expect(chip).toBeDisabled()
    await userEvent.click(chip)
    expect(onClear).not.toHaveBeenCalled()
  })
})
