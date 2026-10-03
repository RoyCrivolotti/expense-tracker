import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UnsavedGroup } from './UnsavedGroup'

const unsaved = (name: string) => ({ name, saving: false, onSave: vi.fn(), onDiscard: vi.fn() })

describe('UnsavedGroup', () => {
  it('keeps the reason Save is off as a tooltip where it has no room for words, as the phone has', () => {
    render(<UnsavedGroup unsaved={unsaved('  ')} onGone={vi.fn()} />)

    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toBeDisabled()
    expect(save).toHaveAttribute('title', 'Give the scenario a name to save it')
    expect(screen.queryByText('Give the scenario a name to save it')).not.toBeInTheDocument()
  })

  it('writes the reason beside the buttons when asked to, and not once there is a name', () => {
    const { rerender } = render(<UnsavedGroup unsaved={unsaved('')} onGone={vi.fn()} nameHint />)
    expect(screen.getByText('Give the scenario a name to save it')).toBeVisible()

    rerender(<UnsavedGroup unsaved={unsaved('Path A')} onGone={vi.fn()} nameHint />)
    expect(screen.queryByText('Give the scenario a name to save it')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes to Path A' })).toBeEnabled()
  })

  it('points Save at words the parent shows under the group, and drops the tooltip, when given their id', () => {
    const { rerender } = render(
      <>
        <UnsavedGroup unsaved={unsaved('')} onGone={vi.fn()} hintId="reason" />
        <p id="reason">Give the scenario a name to save it</p>
      </>,
    )
    const save = screen.getByRole('button', { name: 'Save changes' })
    expect(save).toHaveAccessibleDescription('Give the scenario a name to save it')
    expect(save).not.toHaveAttribute('title')

    rerender(<UnsavedGroup unsaved={unsaved('Path A')} onGone={vi.fn()} hintId="reason" />)
    expect(screen.getByRole('button', { name: 'Save changes to Path A' })).not.toHaveAttribute('aria-describedby')
  })
})
