import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('LazyViewportDebug', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined })
  })

  it('renders nothing when the query param is absent', async () => {
    vi.spyOn(URLSearchParams.prototype, 'get').mockReturnValue(null)
    const { LazyViewportDebug } = await import('./LazyViewportDebug')
    const { container } = render(<LazyViewportDebug />)
    expect(container.innerHTML).toBe('')
  })

  it('lazy-loads the debug panel when ?viewportDebug=1 is set', async () => {
    vi.spyOn(URLSearchParams.prototype, 'get').mockImplementation((key) =>
      key === 'viewportDebug' ? '1' : null,
    )
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        offsetTop: 0,
        offsetLeft: 0,
        height: 844,
        width: 390,
        pageTop: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    })

    const { LazyViewportDebug } = await import('./LazyViewportDebug')
    render(<LazyViewportDebug />)

    await waitFor(() => expect(screen.getByText(/no pan yet/)).toBeInTheDocument())
  })
})
