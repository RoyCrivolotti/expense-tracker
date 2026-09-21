import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMotionDisabledForTests } from '../hooks/motion'
import { usePresence } from '../hooks/usePresence'
import { Presence, PresenceValue } from './Presence'

function Probe({ label = 'probe' }: { label?: string }) {
  const presence = usePresence()
  return <p data-testid={label}>{presence?.closing ? 'leaving' : 'here'}</p>
}

function Typed() {
  const [text, setText] = useState('')
  return <input aria-label="typed" value={text} onChange={(e) => setText(e.target.value)} />
}

beforeEach(() => {
  vi.useFakeTimers()
  setMotionDisabledForTests(false)
})

afterEach(() => {
  vi.useRealTimers()
  setMotionDisabledForTests(true)
})

describe('Presence', () => {
  it('renders its children while shown and nothing while closed', () => {
    const { rerender } = render(
      <Presence show={false} exitMs={100}>
        <Probe />
      </Presence>,
    )
    expect(screen.queryByTestId('probe')).toBeNull()

    rerender(
      <Presence show exitMs={100}>
        <Probe />
      </Presence>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('here')
  })

  it('keeps the children for the exit, tells them they are leaving, then removes them', () => {
    const { rerender } = render(
      <Presence show exitMs={100}>
        <Probe />
      </Presence>,
    )

    rerender(
      <Presence show={false} exitMs={100}>
        <Probe />
      </Presence>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('leaving')

    void act(() => vi.advanceTimersByTime(99))
    expect(screen.getByTestId('probe')).toBeTruthy()

    void act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByTestId('probe')).toBeNull()
  })

  it('removes the children at once when motion is off', () => {
    setMotionDisabledForTests(true)
    const { rerender } = render(
      <Presence show exitMs={100}>
        <Probe />
      </Presence>,
    )

    rerender(
      <Presence show={false} exitMs={100}>
        <Probe />
      </Presence>,
    )
    expect(screen.queryByTestId('probe')).toBeNull()
  })

  it('mounts a fresh instance when reopened mid-exit, so the old one cannot leak its state', () => {
    const tree = (show: boolean) => (
      <Presence show={show} exitMs={100}>
        <Typed />
      </Presence>
    )
    const { rerender } = render(tree(true))
    const first = screen.getByLabelText<HTMLInputElement>('typed')
    fireEvent.change(first, { target: { value: 'half-typed' } })
    expect(screen.getByLabelText<HTMLInputElement>('typed').value).toBe('half-typed')

    rerender(tree(false))
    rerender(tree(true))

    const reopened = screen.getByLabelText<HTMLInputElement>('typed')
    expect(reopened.value).toBe('')
    expect(reopened).not.toBe(first)
    expect(screen.getAllByLabelText('typed')).toHaveLength(1)
  })

  it('does not tell a reopened overlay that it is leaving', () => {
    const tree = (show: boolean) => (
      <Presence show={show} exitMs={100}>
        <Probe />
      </Presence>
    )
    const { rerender } = render(tree(true))
    rerender(tree(false))
    rerender(tree(true))
    expect(screen.getByTestId('probe').textContent).toBe('here')

    void act(() => vi.advanceTimersByTime(500))
    expect(screen.getByTestId('probe').textContent).toBe('here')
  })

  it('takes an overlay nested in another one out with its parent', () => {
    const tree = (show: boolean, innerShown: boolean) => (
      <Presence show={show} exitMs={100}>
        <Probe label="outer" />
        <Presence show={innerShown} exitMs={100}>
          <Probe label="inner" />
        </Presence>
      </Presence>
    )
    const { rerender } = render(tree(true, true))
    expect(screen.getByTestId('inner').textContent).toBe('here')

    // The parent lets go while the child is still asked for, as when Discard closes the
    // modal that a confirm sheet was sitting on.
    rerender(tree(false, true))
    expect(screen.getByTestId('outer').textContent).toBe('leaving')
    expect(screen.getByTestId('inner').textContent).toBe('leaving')

    void act(() => vi.advanceTimersByTime(100))
    expect(screen.queryByTestId('inner')).toBeNull()
  })

  it('lets a nested overlay leave on its own without disturbing its parent', () => {
    const tree = (innerShown: boolean) => (
      <Presence show exitMs={100}>
        <Probe label="outer" />
        <Presence show={innerShown} exitMs={50}>
          <Probe label="inner" />
        </Presence>
      </Presence>
    )
    const { rerender } = render(tree(true))
    rerender(tree(false))

    expect(screen.getByTestId('inner').textContent).toBe('leaving')
    expect(screen.getByTestId('outer').textContent).toBe('here')

    void act(() => vi.advanceTimersByTime(50))
    expect(screen.queryByTestId('inner')).toBeNull()
    expect(screen.getByTestId('outer')).toBeTruthy()
  })
})

describe('PresenceValue', () => {
  it('holds the last value through the exit and reads everything else fresh', () => {
    const tree = (value: string | null, suffix: string) => (
      <PresenceValue value={value} exitMs={100}>
        {(v) => (
          <p data-testid="row">
            {v}
            {suffix}
          </p>
        )}
      </PresenceValue>
    )
    const { rerender } = render(tree('draft', '!'))
    expect(screen.getByTestId('row').textContent).toBe('draft!')

    rerender(tree(null, '?'))
    expect(screen.getByTestId('row').textContent).toBe('draft?')

    void act(() => vi.advanceTimersByTime(100))
    expect(screen.queryByTestId('row')).toBeNull()
  })

  it('holds a function without ever calling it', () => {
    const handler = vi.fn()
    const tree = (value: (() => void) | null) => (
      <PresenceValue value={value} exitMs={100}>
        {(fn) => (
          <button type="button" onClick={fn}>
            press
          </button>
        )}
      </PresenceValue>
    )
    const { rerender } = render(tree(handler))
    expect(handler).not.toHaveBeenCalled()

    rerender(tree(null))
    expect(handler).not.toHaveBeenCalled()

    // Still the same handler, held for the exit.
    fireEvent.click(screen.getByText('press'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('shows the new value straight away when it changes while open', () => {
    const tree = (value: string | null) => (
      <PresenceValue value={value} exitMs={100}>
        {(v) => <p data-testid="row">{v}</p>}
      </PresenceValue>
    )
    const { rerender } = render(tree('one'))
    rerender(tree('two'))
    expect(screen.getByTestId('row').textContent).toBe('two')
  })
})

describe('PresenceValue with a value that is never equal to itself', () => {
  it('settles on NaN instead of re-rendering forever', () => {
    render(
      <PresenceValue value={Number.NaN} exitMs={100}>
        {(n) => <p data-testid="nan">{String(n)}</p>}
      </PresenceValue>,
    )
    expect(screen.getByTestId('nan').textContent).toBe('NaN')
  })
})
