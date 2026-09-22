import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Presence } from '../components/Presence'
import { EXIT_MS, setMotionDisabledForTests } from './motion'
import { usePopoverMotion } from './usePopoverMotion'
import type { Position } from './usePopoverPosition'

const position = (above: boolean): Position => ({ top: 0, left: 0, maxHeight: 300, above })

function Popover({ pos }: { pos: Position | null }) {
  const motion = usePopoverMotion(pos)
  return <div data-testid="popover" style={motion.exit} {...motion.attrs} />
}

describe('usePopoverMotion', () => {
  it('moves away from its trigger: down from one above it, and up from one below it', () => {
    const { rerender } = render(<Popover pos={position(false)} />)
    expect(screen.getByTestId('popover').getAttribute('data-side')).toBe('below')

    rerender(<Popover pos={position(true)} />)
    expect(screen.getByTestId('popover').getAttribute('data-side')).toBe('above')
  })

  it('starts on the trigger side that placement falls back to, before it has been measured', () => {
    render(<Popover pos={null} />)
    expect(screen.getByTestId('popover').getAttribute('data-side')).toBe('below')
  })

  it('takes no input once it is leaving, and says how long it has', () => {
    vi.useFakeTimers()
    setMotionDisabledForTests(false)
    try {
      const tree = (show: boolean) => (
        <Presence show={show} exitMs={EXIT_MS.popover}>
          <Popover pos={position(false)} />
        </Presence>
      )
      const { rerender } = render(tree(true))
      const el = screen.getByTestId('popover')
      expect(el.hasAttribute('inert')).toBe(false)
      expect(el.style.getPropertyValue('--exit-ms')).toBe('')

      rerender(tree(false))

      expect(el.hasAttribute('inert')).toBe(true)
      expect(el.style.getPropertyValue('--exit-ms')).toBe(`${EXIT_MS.popover}ms`)

      void act(() => vi.advanceTimersByTime(EXIT_MS.popover))
      expect(screen.queryByTestId('popover')).toBeNull()
    } finally {
      vi.useRealTimers()
      setMotionDisabledForTests(true)
    }
  })
})

describe('usePopoverMotion outside a Presence', () => {
  beforeEach(() => setMotionDisabledForTests(true))
  afterEach(() => setMotionDisabledForTests(true))

  it('is never leaving, so a popover that is not held closes as it always did', () => {
    render(<Popover pos={position(false)} />)
    expect(screen.getByTestId('popover').hasAttribute('inert')).toBe(false)
  })
})
