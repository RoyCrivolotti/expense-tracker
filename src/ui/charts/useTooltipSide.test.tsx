import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { pickSide, roomAround, useTooltipSide } from './useTooltipSide'

function chartAt(top: number, bottom: number) {
  const el = document.createElement('div')
  const ref = { current: el }
  const move = (t: number, b: number) => {
    el.getBoundingClientRect = () => ({ top: t, bottom: b, height: b - t }) as DOMRect
  }
  move(top, bottom)
  return { ref, move }
}

describe('roomAround', () => {
  it('measures the free band from the top of the page to the bottom of the screen', () => {
    // jsdom lays nothing out, so the bars measure zero and the band is the whole window.
    expect(roomAround({ top: 600, bottom: 700 })).toEqual({ above: 600, below: window.innerHeight - 700 })
  })
})

describe('pickSide', () => {
  it('takes the side with more room, and above when they are equal', () => {
    expect(pickSide({ above: 300, below: 200 })).toBe('above')
    expect(pickSide({ above: 100, below: 500 })).toBe('below')
    expect(pickSide({ above: 250, below: 250 })).toBe('above')
  })
})

describe('useTooltipSide', () => {
  it('opens above a chart low on the screen and below one high on it', () => {
    const low = chartAt(window.innerHeight - 300, window.innerHeight - 70)
    expect(renderHook(() => useTooltipSide(true, low.ref)).result.current).toBe('above')
    const high = chartAt(70, 300)
    expect(renderHook(() => useTooltipSide(true, high.ref)).result.current).toBe('below')
  })

  it('holds its side while open, and chooses again the next time it opens', () => {
    const chart = chartAt(70, 300)
    const { result, rerender } = renderHook(({ open }) => useTooltipSide(open, chart.ref), {
      initialProps: { open: true },
    })
    expect(result.current).toBe('below')
    // The page moves under the open tooltip: it must not jump to the other side.
    chart.move(window.innerHeight - 300, window.innerHeight - 70)
    rerender({ open: true })
    expect(result.current).toBe('below')
    rerender({ open: false })
    rerender({ open: true })
    expect(result.current).toBe('above')
  })

  it('does nothing while closed', () => {
    const chart = chartAt(70, 300)
    expect(renderHook(() => useTooltipSide(false, chart.ref)).result.current).toBe('above')
  })
})
