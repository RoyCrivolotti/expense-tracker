import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { useElementWidth } from './useElementWidth'

function Probe({ width }: { width: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const measured = useElementWidth(ref, 360)
  return (
    <div
      ref={(el) => {
        // jsdom lays nothing out, so the width the hook reads has to be planted.
        if (el) Object.defineProperty(el, 'clientWidth', { value: width, configurable: true })
        ref.current = el
      }}
    >
      <span>{measured}</span>
    </div>
  )
}

describe('useElementWidth', () => {
  it('reads the element width once it has one', () => {
    render(<Probe width={812} />)
    expect(screen.getByText('812')).toBeInTheDocument()
  })

  it('keeps the fallback while the element has no width', () => {
    render(<Probe width={0} />)
    expect(screen.getByText('360')).toBeInTheDocument()
  })
})
