import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { THRESHOLD_PX } from '../hooks/usePullToRefresh'
import { PullToRefreshIndicator } from './PullToRefreshIndicator'

const strip = (container: HTMLElement) => container.firstElementChild as HTMLElement

describe('PullToRefreshIndicator', () => {
  it('follows the finger at less than the pull, and with no easing while it is down', () => {
    const { container } = render(<PullToRefreshIndicator pullPx={100} isPulling refreshing={false} />)

    expect(strip(container).style.height).toBe('45px')
    expect(strip(container).className).toContain('tracking')
  })

  it('stays in the page at no height after letting go, so the page closes up instead of jumping', () => {
    const { container, rerender } = render(<PullToRefreshIndicator pullPx={60} isPulling refreshing={false} />)
    expect(strip(container).style.height).toBe('27px')

    rerender(<PullToRefreshIndicator pullPx={0} isPulling={false} refreshing={false} />)

    // Unmounting here is what used to drop the whole strip in one frame.
    expect(strip(container)).not.toBeNull()
    expect(strip(container).style.height).toBe('0px')
    expect(strip(container).className).not.toContain('tracking')
  })

  it('holds a fixed row for the spinner while refreshing, and lets it ease closed afterwards', () => {
    const { container, rerender } = render(<PullToRefreshIndicator pullPx={0} isPulling={false} refreshing />)
    expect(strip(container).style.height).toBe('40px')

    rerender(<PullToRefreshIndicator pullPx={0} isPulling={false} refreshing={false} />)
    expect(strip(container).style.height).toBe('0px')
  })

  it('keeps a tiny pull from showing anything', () => {
    const { container } = render(<PullToRefreshIndicator pullPx={6} isPulling refreshing={false} />)
    expect(strip(container).style.height).toBe('0px')
  })

  it('turns to the accent once the pull is far enough to refresh', () => {
    const { container, rerender } = render(<PullToRefreshIndicator pullPx={THRESHOLD_PX - 1} isPulling refreshing={false} />)
    expect(strip(container).className).not.toContain('ready')

    rerender(<PullToRefreshIndicator pullPx={THRESHOLD_PX} isPulling refreshing={false} />)
    expect(strip(container).className).toContain('ready')
  })
})
