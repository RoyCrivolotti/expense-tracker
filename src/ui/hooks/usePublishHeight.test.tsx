import { useRef } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { usePublishHeight } from './usePublishHeight'

function Bar() {
  const ref = useRef<HTMLDivElement>(null)
  usePublishHeight(ref, '--test-bar')
  return <div ref={ref} />
}

const published = () => document.documentElement.style.getPropertyValue('--test-bar')

describe('usePublishHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('publishes the height while mounted, follows a resize, and clears it on unmount', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(60)
    const { unmount } = render(<Bar />)
    expect(published()).toBe('60px')

    // The label wrapping onto another line at phone width.
    height.mockReturnValue(73)
    resizeObservers.at(-1)?.trigger()
    expect(published()).toBe('73px')

    unmount()
    expect(published()).toBe('')
  })
})
