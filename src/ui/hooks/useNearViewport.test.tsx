import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../../testing/fakeIntersectionObserver'
import { useNearViewport } from './useNearViewport'

function Probe() {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNearViewport(ref, 500)
  return <div ref={ref}>{near ? 'near' : 'far'}</div>
}

afterEach(() => vi.unstubAllGlobals())

describe('useNearViewport', () => {
  it('says near where there is no IntersectionObserver, so what waits on it is still shown', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Probe />)
    expect(screen.getByText('near')).toBeInTheDocument()
  })

  it('watches the box with the margin on both sides, and follows what the observer reports', () => {
    const io = installFakeIntersectionObserver()
    render(<Probe />)
    expect(io.live()[0]!.options?.rootMargin).toBe('500px 0px')
    act(() => io.emit(0))
    expect(screen.getByText('far')).toBeInTheDocument()
    act(() => io.emit(0.2))
    expect(screen.getByText('near')).toBeInTheDocument()
  })

  it('reads the newest report when the observer delivers several at once: a box that left and came back between two frames is near', () => {
    const io = installFakeIntersectionObserver()
    render(<Probe />)
    act(() => io.emitBatch([0, 0.3]))
    expect(screen.getByText('near')).toBeInTheDocument()
    act(() => io.emitBatch([0.3, 0]))
    expect(screen.getByText('far')).toBeInTheDocument()
  })

  it('measures the box as it is first watched, so a card on screen is not shown as far for a frame', () => {
    installFakeIntersectionObserver()
    // jsdom reports every box as 0 by 0 at the top of the page: on screen.
    render(<Probe />)
    expect(screen.getByText('near')).toBeInTheDocument()
  })

  it('measures a box well above the screen as far too, and one just inside the margin above it as near', () => {
    installFakeIntersectionObserver()
    const box = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    box.mockReturnValue({ top: -1_000, bottom: -900 } as DOMRect)
    const far = render(<Probe />)
    expect(screen.getByText('far')).toBeInTheDocument()
    far.unmount()
    box.mockReturnValue({ top: -600, bottom: -450 } as DOMRect)
    render(<Probe />)
    expect(screen.getByText('near')).toBeInTheDocument()
    box.mockRestore()
  })

  it('measures a box well below the screen as far, and one just inside the margin as near', () => {
    installFakeIntersectionObserver()
    const box = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    box.mockReturnValue({ top: window.innerHeight + 900, bottom: window.innerHeight + 1000 } as DOMRect)
    const far = render(<Probe />)
    expect(screen.getByText('far')).toBeInTheDocument()
    far.unmount()
    box.mockReturnValue({ top: window.innerHeight + 450, bottom: window.innerHeight + 550 } as DOMRect)
    render(<Probe />)
    expect(screen.getByText('near')).toBeInTheDocument()
    box.mockRestore()
  })

  it('stops watching when it unmounts', () => {
    const io = installFakeIntersectionObserver()
    const { unmount } = render(<Probe />)
    unmount()
    expect(io.live()).toHaveLength(0)
  })
})
