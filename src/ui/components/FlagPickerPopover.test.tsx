import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import { FlagPickerPopover } from './FlagPickerPopover'

const work: Flag = {
  id: 1,
  name: 'Work travel',
  color: '#6366f1',
  description: 'Reimbursable — submit monthly',
  sortOrder: 0,
  active: true,
}
const tax: Flag = { id: 2, name: 'Tax deductible', color: '#10b981', sortOrder: 1, active: true }

/**
 * The popover positions itself against a real trigger; without one the hook
 * bails and leaves it `visibility: hidden`, which hides it from the a11y tree
 * (and so from getByRole). Mount a real trigger the way the app does.
 */
function Harness(props: Partial<Parameters<typeof FlagPickerPopover>[0]>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={triggerRef}>
        Flag
      </button>
      <FlagPickerPopover
        value={null}
        flags={[work, tax]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        {...props}
        triggerRef={triggerRef}
      />
    </>
  )
}

function renderPicker(props: Partial<Parameters<typeof FlagPickerPopover>[0]> = {}) {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<Harness onSelect={onSelect} onClose={onClose} {...props} />)
  return { onSelect, onClose }
}

describe('FlagPickerPopover', () => {
  it('lists every active flag plus a "No flag" option', () => {
    renderPicker()

    expect(screen.getByRole('button', { name: /No flag/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Work travel/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tax deductible/ })).toBeInTheDocument()
  })

  it('shows a flag description so the picker explains what the flag is for', () => {
    renderPicker()

    expect(screen.getByText('Reimbursable — submit monthly')).toBeInTheDocument()
  })

  it('marks the applied flag as pressed and the others as not', () => {
    renderPicker({ value: 1 })

    expect(screen.getByRole('button', { name: /Work travel/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /No flag/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selects a flag and closes', async () => {
    const { onSelect, onClose } = renderPicker()

    await userEvent.click(screen.getByRole('button', { name: /Tax deductible/ }))

    expect(onSelect).toHaveBeenCalledWith(2)
    expect(onClose).toHaveBeenCalled()
  })

  it('clears the flag with null, not undefined', async () => {
    const { onSelect } = renderPicker({ value: 1 })

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('hides an archived flag that is not the current value', () => {
    renderPicker({ flags: [work, { ...tax, active: false }] })

    expect(screen.queryByRole('button', { name: /Tax deductible/ })).not.toBeInTheDocument()
  })

  it('still offers the applied flag once archived, labelled as such', () => {
    renderPicker({ flags: [work, { ...tax, active: false }], value: 2 })

    expect(screen.getByRole('button', { name: /Tax deductible/ })).toBeInTheDocument()
    expect(screen.getByText(/archived/)).toBeInTheDocument()
  })

  it('points at Settings when there is nothing to choose', () => {
    renderPicker({ flags: [] })

    expect(screen.getByText(/Settings/)).toBeInTheDocument()
  })

})
