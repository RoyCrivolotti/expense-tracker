import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeFlag } from '../../testing/factories'
import { FlagField } from './FlagField'

const work = makeFlag({ id: 1, name: 'Work travel' })
const tax = makeFlag({ id: 2, name: 'Tax deductible', color: '#10b981', sortOrder: 1 })

function renderField(props: Partial<Parameters<typeof FlagField>[0]> = {}) {
  const onChange = vi.fn()
  const onTrapPausedChange = vi.fn()
  render(
    <FlagField
      flags={[work, tax]}
      value={null}
      onChange={onChange}
      onTrapPausedChange={onTrapPausedChange}
      {...props}
    />,
  )
  return { onChange, onTrapPausedChange }
}

describe('FlagField', () => {
  it('reads "No flag" when nothing is applied', () => {
    renderField()

    expect(screen.getByRole('button', { name: /No flag/ })).toBeInTheDocument()
  })

  it('names the applied flag', () => {
    renderField({ value: 1 })

    expect(screen.getByRole('button', { name: /Work travel/ })).toBeInTheDocument()
  })

  it('takes no space when the owner has no flags and none is applied', () => {
    const { container } = render(
      <FlagField flags={[]} value={null} onChange={vi.fn()} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('opens the picker and reports a choice', async () => {
    const { onChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))
    await userEvent.click(screen.getByRole('button', { name: /Tax deductible/ }))

    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('pauses the enclosing modal focus trap while the picker is open', async () => {
    // Without this the Modal's own Escape handler closes the whole editor and
    // its trap pulls focus back out of the portalled popover.
    const { onTrapPausedChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: /No flag/ }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: /Work travel/ }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })

  it('marks the trigger as a dialog opener for assistive tech', async () => {
    renderField()
    const trigger = screen.getByRole('button', { name: /No flag/ })

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
