import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeCashRow } from '../../../testing/cashRow'
import { DriftBars } from './DriftBars'

describe('DriftBars', () => {
  it('draws a row per counted month and flags only the drift beyond the band', () => {
    const { container } = render(
      <DriftBars
        rows={[
          makeCashRow({ month: '2026-01', monthGapCents: 0 }),
          makeCashRow({ month: '2026-02', monthGapCents: -300 }),
          makeCashRow({ month: '2026-03', monthGapCents: 2_000 }),
          makeCashRow({ month: '2026-04', monthGapCents: null }),
        ]}
      />,
    )

    expect(screen.getByText('New drift per counted month')).toBeInTheDocument()
    expect(screen.getByText(/band: ±/)).toBeInTheDocument()
    expect(screen.getByText('Jan')).toBeInTheDocument()
    expect(screen.getByText('Mar')).toBeInTheDocument()
    expect(screen.queryByText('Apr')).toBeNull()

    // A zero gap has no bar, a gap inside the band is ok, one beyond it is over.
    expect(container.querySelectorAll('[class*="driftOk"]')).toHaveLength(1)
    expect(container.querySelectorAll('[class*="driftOver"]')).toHaveLength(1)
    expect(container.querySelectorAll('[class*="driftAmountOver"]')).toHaveLength(1)
  })

  it('renders nothing while no month has been counted', () => {
    const { container } = render(<DriftBars rows={[makeCashRow({ monthGapCents: null })]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
