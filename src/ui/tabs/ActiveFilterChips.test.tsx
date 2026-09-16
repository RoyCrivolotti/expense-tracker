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

  it('says why instead of clearing while rows are being selected', async () => {
    // Clearing the date scope narrows the list back to one month, which would hide rows
    // that are already chosen, and the filters are locked so it could not be undone.
    const onClear = vi.fn()
    const onLockedPress = vi.fn()
    render(
      <ActiveFilterChips
        chips={[{ key: 'scope', label: 'Dates: last 3 months', onClear }]}
        locked
        onLockedPress={onLockedPress}
      />,
    )
    const chip = screen.getByRole('button', { name: /Dates: last 3 months/ })

    expect(chip).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(chip)
    expect(onClear).not.toHaveBeenCalled()
    expect(onLockedPress).toHaveBeenCalledTimes(1)
  })
})
