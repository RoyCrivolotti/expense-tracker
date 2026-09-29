import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LiveLegend, type LiveLegendItem } from './LiveLegend'

const formatValue = (cents: number) => `€${(cents / 100).toFixed(2)}`

describe('LiveLegend', () => {
  it('renders nothing for an empty item list', () => {
    const { container } = render(<LiveLegend items={[]} formatValue={formatValue} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders each row with its label and formatted value', () => {
    const items: LiveLegendItem[] = [
      { label: 'Invested', color: '#6366f1', valueCents: 125_000 },
      { label: 'Mortgage', color: '#ef4444', valueCents: null },
    ]
    render(<LiveLegend items={items} formatValue={formatValue} />)
    expect(screen.getByText('Invested')).toBeInTheDocument()
    expect(screen.getByText('€1250.00')).toBeInTheDocument()
    // A null value renders a blank, not "€0.00" or the literal word "null".
    expect(screen.getByText('Mortgage')).toBeInTheDocument()
  })

  it('shows a dash for a value out of the focused run instead of a blank', () => {
    const items: LiveLegendItem[] = [{ label: 'Path A', color: '#6366f1', valueCents: null, outOfRun: true }]
    render(<LiveLegend items={items} formatValue={formatValue} />)
    expect(screen.getByText('-')).toBeInTheDocument()
  })

  it('hands out its list element via listRef', () => {
    const listRef = createRef<HTMLUListElement>()
    const { container } = render(
      <LiveLegend items={[{ label: 'Path A', color: '#6366f1', valueCents: 100 }]} formatValue={formatValue} listRef={listRef} />,
    )
    expect(listRef.current).toBe(container.querySelector('ul'))
  })

  it('renders a toggleable row as a button and calls onToggle with its scenarioId', () => {
    const onToggle = vi.fn()
    render(
      <LiveLegend
        items={[{ label: 'Path A', color: '#6366f1', valueCents: 100, scenarioId: 7 }]}
        formatValue={formatValue}
        onToggle={onToggle}
      />,
    )
    const button = screen.getByRole('button', { name: 'Hide Path A on chart' })
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledWith(7)
  })

  it('does not make a row a button when it has no scenarioId, even with onToggle passed', () => {
    render(<LiveLegend items={[{ label: 'Path A', color: '#6366f1', valueCents: 100 }]} formatValue={formatValue} onToggle={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks a hidden row aria-pressed=false and offers to show it again', () => {
    render(
      <LiveLegend
        items={[{ label: 'Path A', color: '#6366f1', valueCents: 100, scenarioId: 7, hidden: true }]}
        formatValue={formatValue}
        onToggle={vi.fn()}
      />,
    )
    const button = screen.getByRole('button', { name: 'Show Path A on chart' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})
