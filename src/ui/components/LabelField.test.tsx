import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLabel } from '../../testing/factories'
import { LabelField } from './LabelField'

const trip = makeLabel({ id: 1, name: 'Japan trip' })
const move = makeLabel({ id: 2, name: 'Moving expenses', color: '#f59e0b', sortOrder: 1 })

function renderField(props: Partial<Parameters<typeof LabelField>[0]> = {}) {
  const onChange = vi.fn()
  const onTrapPausedChange = vi.fn()
  render(
    <LabelField
      labels={[trip, move]}
      value={[]}
      onChange={onChange}
      onTrapPausedChange={onTrapPausedChange}
      {...props}
    />,
  )
  return { onChange, onTrapPausedChange }
}

describe('LabelField', () => {
  it('reads "No labels" when nothing is applied', () => {
    renderField()

    expect(screen.getByRole('button', { name: 'No labels' })).toBeInTheDocument()
  })

  it('counts a single applied label', () => {
    renderField({ value: [1] })

    expect(screen.getByRole('button', { name: '1 label' })).toBeInTheDocument()
  })

  it('counts several applied labels', () => {
    renderField({ value: [1, 2] })

    expect(screen.getByRole('button', { name: '2 labels' })).toBeInTheDocument()
  })

  it('is present before any label exists, so the feature is discoverable', async () => {
    render(<LabelField labels={[]} value={[]} onChange={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'No labels' }))

    expect(screen.getByText(/Settings/)).toBeInTheDocument()
  })

  it('opens the picker and toggles a choice, without closing', async () => {
    const { onChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: 'No labels' }))
    await userEvent.click(screen.getByRole('button', { name: /Moving expenses/ }))

    expect(onChange).toHaveBeenCalledWith([2])
    // Multi-select stays open for further picks — only "Done" closes it.
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()
  })

  it('unions onto the existing selection rather than replacing it', async () => {
    const { onChange } = renderField({ value: [1] })

    await userEvent.click(screen.getByRole('button', { name: '1 label' }))
    await userEvent.click(screen.getByRole('button', { name: /Moving expenses/ }))

    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  it('removes a label already selected when toggled again', async () => {
    const { onChange } = renderField({ value: [1, 2] })

    await userEvent.click(screen.getByRole('button', { name: '2 labels' }))
    await userEvent.click(screen.getByRole('button', { name: /Japan trip/ }))

    expect(onChange).toHaveBeenCalledWith([2])
  })

  it('pauses the enclosing modal focus trap while open, and un-pauses on Done', async () => {
    const { onTrapPausedChange } = renderField()

    await userEvent.click(screen.getByRole('button', { name: 'No labels' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })

  it('marks the trigger as a dialog opener for assistive tech', async () => {
    renderField()
    const trigger = screen.getByRole('button', { name: 'No labels' })

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(trigger)

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})

describe('LabelField — reporting to the modal trap', () => {
  it('reports open synchronously; Done reports the close', () => {
    const { onTrapPausedChange } = renderField()

    fireEvent.click(screen.getByRole('button', { name: 'No labels' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onTrapPausedChange).toHaveBeenLastCalledWith(false)
  })
})
