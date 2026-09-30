import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Label } from '../../types'
import { LabelPickerPopover } from './LabelPickerPopover'

const trip: Label = {
  id: 1,
  name: 'Japan trip',
  color: '#6366f1',
  description: 'Spring 2027',
  sortOrder: 0,
  active: true,
}
const move: Label = { id: 2, name: 'Moving expenses', color: '#10b981', sortOrder: 1, active: true }

/**
 * The popover positions itself against a real trigger; without one the hook
 * bails and leaves it `visibility: hidden`, which hides it from the a11y tree
 * (and so from getByRole). Mount a real trigger the way the app does.
 */
function Harness(props: Partial<Parameters<typeof LabelPickerPopover>[0]>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button type="button" ref={triggerRef}>
        Labels
      </button>
      <LabelPickerPopover
        value={[]}
        labels={[trip, move]}
        onToggle={vi.fn()}
        onClose={vi.fn()}
        {...props}
        triggerRef={triggerRef}
      />
    </>
  )
}

function renderPicker(props: Partial<Parameters<typeof LabelPickerPopover>[0]> = {}) {
  const onToggle = vi.fn()
  const onClose = vi.fn()
  render(<Harness onToggle={onToggle} onClose={onClose} {...props} />)
  return { onToggle, onClose }
}

describe('LabelPickerPopover', () => {
  it('lists every active label', () => {
    renderPicker()

    expect(screen.getByRole('button', { name: /Japan trip/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Moving expenses/ })).toBeInTheDocument()
  })

  it('shows a label description so the picker explains what it is for', () => {
    renderPicker()

    expect(screen.getByText('Spring 2027')).toBeInTheDocument()
  })

  it('marks a selected label as pressed and the others as not', () => {
    renderPicker({ value: [1] })

    expect(screen.getByRole('button', { name: /Japan trip/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Moving expenses/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('toggles a label on and stays open', async () => {
    const { onToggle, onClose } = renderPicker()

    await userEvent.click(screen.getByRole('button', { name: /Moving expenses/ }))

    expect(onToggle).toHaveBeenCalledWith(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes only from the Done button', async () => {
    const { onClose } = renderPicker()

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('hides an archived label that is not currently selected', () => {
    renderPicker({ labels: [trip, { ...move, active: false }] })

    expect(screen.queryByRole('button', { name: /Moving expenses/ })).not.toBeInTheDocument()
  })

  it('still offers a selected label once archived, labelled as such', () => {
    renderPicker({ labels: [trip, { ...move, active: false }], value: [2] })

    expect(screen.getByRole('button', { name: /Moving expenses/ })).toBeInTheDocument()
    expect(screen.getByText(/archived/)).toBeInTheDocument()
  })

  it('points at Settings when there is nothing to choose', () => {
    renderPicker({ labels: [] })

    expect(screen.getByText(/Settings/)).toBeInTheDocument()
  })
})

describe('LabelPickerPopover — creating a label in place', () => {
  it('offers no create affordance without onCreate, and still points at Settings', () => {
    render(<Harness labels={[]} />)
    expect(screen.queryByRole('button', { name: '+ New label' })).not.toBeInTheDocument()
    expect(screen.getByText(/Add one under Settings/)).toBeInTheDocument()
  })

  it('creates the label and selects it, without closing the picker', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(9)
    const { onToggle, onClose } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Madrid trip')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(onCreate).toHaveBeenCalledWith('Madrid trip')
    // Toggling it in is the point — creating a label you then have to pick
    // again is barely better than walking to Settings.
    expect(onToggle).toHaveBeenCalledWith(9)
    expect(onClose).not.toHaveBeenCalled()
    // Back on the list, not stuck on the create form.
    expect(screen.getByRole('button', { name: '+ New label' })).toBeInTheDocument()
  })

  it('submits on Enter, so the whole thing is type-and-go', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockResolvedValue(9)
    const { onToggle } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Madrid trip{Enter}')

    expect(onToggle).toHaveBeenCalledWith(9)
  })

  it('refuses a duplicate name instead of creating a second Japan trip', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'japan trip{Enter}')

    expect(screen.getByRole('alert')).toHaveTextContent('already a label with that name')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('asks for a name rather than creating an unnamed label', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a name')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('surfaces a failed create on the picker instead of rejecting silently', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn().mockRejectedValue(new Error('Network is down'))
    const { onToggle } = renderPicker({ onCreate })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Madrid trip{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Network is down')
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('backs out to the list on Escape without closing the whole picker', async () => {
    const user = userEvent.setup()
    const { onClose } = renderPicker({ onCreate: vi.fn() })

    await user.click(screen.getByRole('button', { name: '+ New label' }))
    await user.type(screen.getByRole('textbox', { name: 'New label name' }), 'Madrid{Escape}')

    // Escape here means "not this after all", not "abandon the transaction".
    expect(screen.getByRole('button', { name: '+ New label' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
