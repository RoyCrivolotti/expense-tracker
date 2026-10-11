import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installFakeIntersectionObserver } from '../../../../testing/fakeIntersectionObserver'
import { NearScreen } from './NearScreen'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('NearScreen', () => {
  const at = (top: number) => {
    installFakeIntersectionObserver()
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 400 } as DOMRect)
    return render(<NearScreen>{(near) => (near ? 'near' : 'far')}</NearScreen>)
  }

  it('counts a card as near within 500px of the screen, below it or above it, and as far beyond', () => {
    const below = at(window.innerHeight + 490)
    expect(screen.getByText('near')).toBeInTheDocument()
    below.unmount()
    const far = at(window.innerHeight + 520)
    expect(screen.getByText('far')).toBeInTheDocument()
    far.unmount()
    // Above: the box ends 490px over the top of the screen.
    const above = at(-890)
    expect(screen.getByText('near')).toBeInTheDocument()
    above.unmount()
    at(-920)
    expect(screen.getByText('far')).toBeInTheDocument()
  })

  it('watches with the same margin, so the observer agrees with the first measurement', () => {
    const io = installFakeIntersectionObserver()
    render(<NearScreen>{() => 'x'}</NearScreen>)
    expect(io.live()[0]!.options?.rootMargin).toBe('500px 0px')
  })
})
