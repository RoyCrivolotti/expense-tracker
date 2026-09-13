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
  reimbursable: true,
  sortOrder: 0,
  active: true,
}
const tax: Flag = { id: 2, name: 'Tax deductible', color: '#10b981', reimbursable: true, sortOrder: 1, active: true }

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

describe('FlagPickerPopover — creating a flag in place', () => {
  it('offers no create affordance without onCreate, and still points at Settings', () => {
    render(<Harness flags={[]} />)
    expect(screen.queryByRole('button', { name: '+ New flag' })).not.toBeInTheDocument()
    expect(screen.getByText(/Add one under Settings/)).toBeInTheDocument()
  })

  it('creates the flag and applies it to the transaction in one go', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(9)
    const { onSelect, onClose } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.type(screen.getByRole('textbox', { name: 'New flag name' }), 'Madrid trip')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onCreate).toHaveBeenCalledWith('Madrid trip')
    // Selecting it is the point — creating a flag you then have to pick again
    // is barely better than walking to Settings.
    expect(onSelect).toHaveBeenCalledWith(9)
    expect(onClose).toHaveBeenCalled()
  })

  it('submits on Enter, so the whole thing is type-and-go', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(9)
    const { onSelect } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.type(screen.getByRole('textbox', { name: 'New flag name' }), 'Madrid trip{Enter}')

    expect(onSelect).toHaveBeenCalledWith(9)
  })

  it('refuses a duplicate name instead of creating a second Work travel', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.type(screen.getByRole('textbox', { name: 'New flag name' }), 'work travel{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('already a flag with that name')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('asks for a name rather than creating an unnamed flag', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('surfaces a failed create on the picker instead of rejecting silently', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockRejectedValue(new Error('Network is down'))
    const { onSelect } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.type(screen.getByRole('textbox', { name: 'New flag name' }), 'Madrid trip{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Network is down')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('backs out to the list on Escape without closing the whole picker', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPicker({ onCreate: vi.fn() })

    await user.click(screen.getByRole('button', { name: '+ New flag' }))
    await user.type(screen.getByRole('textbox', { name: 'New flag name' }), 'Madrid{Escape}')

    // Escape here means "not this after all", not "abandon the transaction".
    expect(screen.getByRole('button', { name: '+ New flag' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
