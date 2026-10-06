import { act, render, screen } from '@testing-library/react'
import { Profiler, useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { resizeObservers } from '../../test/setup'
import { useElementSize } from './useElementSize'

let commits = 0
const box = { width: 0, height: 0 }

function Probe({ track = false }: { track?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const size = useElementSize(ref, { width: 360, height: 210 }, track)
  return (
    <div
      ref={(el) => {
        // jsdom lays nothing out, so the size the hook reads has to be planted.
        if (el) {
          Object.defineProperty(el, 'clientWidth', { get: () => box.width, configurable: true })
          Object.defineProperty(el, 'clientHeight', { get: () => box.height, configurable: true })
        }
        ref.current = el
      }}
    >
      <span data-testid="size">{`${size.width}x${size.height}`}</span>
    </div>
  )
}

const size = () => screen.getByTestId('size').textContent

function resizeTo(width: number, height: number) {
  box.width = width
  box.height = height
  act(() => resizeObservers.at(-1)?.trigger())
}

describe('useElementSize', () => {
  it('keeps the fallback while the element has no size', () => {
    box.width = 0
    box.height = 0
    render(<Probe track />)
    expect(size()).toBe('360x210')
  })

  it('reads the width and, when asked to, the height', () => {
    box.width = 812
    box.height = 301.6
    render(<Probe track />)
    expect(size()).toBe('812x302')
  })

  it('leaves the height at its fallback when it is not tracked', () => {
    box.width = 812
    box.height = 301
    render(<Probe />)
    expect(size()).toBe('812x210')
  })

  it('follows a resize and holds the last value for a side that measures nothing', () => {
    box.width = 400
    box.height = 300
    render(<Probe track />)
    resizeTo(520, 280)
    expect(size()).toBe('520x280')
    resizeTo(0, 0)
    expect(size()).toBe('520x280')
    resizeTo(600, 0)
    expect(size()).toBe('600x280')
  })

  it('does not render again for a resize that changes nothing', () => {
    box.width = 400
    box.height = 300
    render(
      <Profiler id="probe" onRender={() => (commits += 1)}>
        <Probe track />
      </Profiler>,
    )
    const before = commits
    resizeTo(400.4, 300.2)
    expect(commits).toBe(before)
    resizeTo(401, 300)
    expect(commits).toBe(before + 1)
  })

  it('stops watching when it unmounts', () => {
    box.width = 400
    box.height = 300
    const { unmount } = render(<Probe track />)
    expect(resizeObservers).toHaveLength(1)
    unmount()
    expect(resizeObservers).toHaveLength(0)
  })
})
