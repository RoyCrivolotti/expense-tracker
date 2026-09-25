import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InflationSetting } from './InflationSetting'
import { defaultExpenseSettings } from '../../engine'

const settings = (assumedInflation: number) => ({ ...defaultExpenseSettings(), assumedInflation })

describe('InflationSetting', () => {
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('says what the rate converts, not that the plan is at it', () => {
    render(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} />)
    // The plan is in today's money whatever the rate is; the rate is what brings the rest to it.
    expect(screen.getByRole('heading', { name: 'Assumed inflation' })).toBeInTheDocument()
    expect(screen.getByText(/brought back to today's money at this rate/)).toBeInTheDocument()
    expect(screen.queryByText(/everything in goals is in today's money at this rate/i)).not.toBeInTheDocument()
  })

  it('saves what is typed as the setting', () => {
    const onChange = vi.fn().mockResolvedValue(undefined)
    render(<InflationSetting settings={settings(0.02)} onChange={onChange} />)
    const input = screen.getByLabelText('Assumed inflation')
    expect(input).toHaveValue('2,0')

    fireEvent.change(input, { target: { value: '3,5' } })
    fireEvent.blur(input)

    expect(onChange).toHaveBeenCalledWith({ assumedInflation: 0.035 })
  })

  it('brings itself into view only when asked to', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = render(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} />)
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender(<InflationSetting settings={settings(0.02)} onChange={vi.fn()} scrollIntoView />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
