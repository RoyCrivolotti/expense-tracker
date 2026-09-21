import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Presence } from '../components/Presence'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { BatchBar } from './BatchBar'

const baseProps = {
  totalCount: 10,
  onCancel: vi.fn(),
  onSelectAll: vi.fn(),
  onDeselectAll: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('BatchBar', () => {
  it('says how many chosen rows the filter is hiding', () => {
    // Otherwise a narrowed list reads as a shrunken selection, which is the confusion
    // that made the old behaviour look like data loss.
    render(<BatchBar count={2} hiddenCount={3} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText(/3 not shown/)).toBeInTheDocument()
  })

  it('says nothing about hidden rows when there are none', () => {
    render(<BatchBar count={2} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.queryByText(/not shown/)).not.toBeInTheDocument()
  })

  it('still closes without write access, but offers nothing to act with', () => {
    render(<BatchBar count={2} busy={false} readOnly editOpen={false} {...baseProps} />)
    expect(screen.getByLabelText('Exit selection mode')).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('cannot be closed while an action is running', () => {
    render(<BatchBar count={2} busy={true} editOpen={false} {...baseProps} />)
    expect(screen.getByLabelText('Exit selection mode')).toBeDisabled()
  })

  it('shows "Deleting…" only when busy and edit is not open', () => {
    render(<BatchBar count={2} busy={true} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Deleting…')).toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('shows "Delete" when busy but edit is open', () => {
    render(<BatchBar count={2} busy={true} editOpen={true} {...baseProps} />)
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.queryByText('Deleting…')).not.toBeInTheDocument()
  })

  it('shows "Select all" when not all items are selected', () => {
    render(<BatchBar count={3} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Select all')).toBeInTheDocument()
  })

  it('shows "Deselect all" when all items are selected', () => {
    render(<BatchBar count={10} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByText('Deselect all')).toBeInTheDocument()
  })

  it('renders close button with accessible label', () => {
    render(<BatchBar count={2} busy={false} editOpen={false} {...baseProps} />)
    expect(screen.getByLabelText('Exit selection mode')).toBeInTheDocument()
  })
})

describe('BatchBar leaving', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    setMotionDisabledForTests(true)
  })

  const bar = (show: boolean) => (
    <Presence show={show} exitMs={EXIT_MS.bar}>
      <BatchBar count={2} busy={false} editOpen={false} {...baseProps} />
    </Presence>
  )
  const published = () => document.documentElement.style.getPropertyValue('--exp-selection-bar')

  it('slides away over the time it is held for, and takes no taps meanwhile', () => {
    const { rerender, container } = render(bar(true))
    const el = container.firstElementChild as HTMLElement
    expect(el.className).not.toContain('batchBarLeaving')

    rerender(bar(false))

    expect(el.className).toContain('batchBarLeaving')
    expect(el.hasAttribute('inert')).toBe(true)
    expect(el.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.bar}ms`)

    void act(() => vi.advanceTimersByTime(EXIT_MS.bar))
    expect(container.firstElementChild).toBeNull()
  })

  it('stops holding up the toast as soon as it starts to leave, not when it finally unmounts', () => {
    const { rerender } = render(bar(true))
    expect(published()).toBe('64px')

    rerender(bar(false))

    expect(published()).toBe('')
  })
})
