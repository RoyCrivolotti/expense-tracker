import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useChartFocus, type ChartFocusOptions } from './useChartFocus'

/** What jsdom lacks of an svg: a screen matrix, points, a viewBox and pointer capture. */
const points: { x: number; y: number }[] = []
const restores: (() => void)[] = []

function stub(target: object, key: string, descriptor: PropertyDescriptor) {
  const original = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { configurable: true, ...descriptor })
  restores.push(() => {
    if (original) Object.defineProperty(target, key, original)
    else delete (target as Record<string, unknown>)[key]
  })
}

let box = { top: 100, height: 400 }

beforeEach(() => {
  points.length = 0
  box = { top: 100, height: 400 }
  // The chart is 400 units wide and drawn 1:1, so a step at x is a step at x pixels.
  stub(Element.prototype, 'clientWidth', { get: () => 400 })
  stub(Element.prototype, 'setPointerCapture', { value: vi.fn() })
  stub(SVGSVGElement.prototype, 'viewBox', { get: () => ({ baseVal: { x: 0, y: 0, width: 400, height: 200 } }) })
  stub(SVGSVGElement.prototype, 'getScreenCTM', { value: () => ({ inverse: () => ({}) }) })
  stub(SVGSVGElement.prototype, 'createSVGPoint', {
    value: () => {
      const pt = {
        x: 0,
        y: 0,
        matrixTransform: () => ({ x: pt.x, y: pt.y }),
      }
      points.push(pt)
      return pt
    },
  })
  stub(SVGSVGElement.prototype, 'getBoundingClientRect', {
    value: () => ({ left: 0, ...box, width: 200 }) as DOMRect,
  })
})

afterEach(() => {
  while (restores.length) restores.pop()?.()
})

/** Five steps a hundred apart, so step i is at x = 100 * i. */
function Harness({ options, length = 5 }: { options?: ChartFocusOptions; length?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const xForIndex = useCallback((i: number) => i * 100, [])
  const { active, ...handlers } = useChartFocus(length, xForIndex, ref, options)
  return (
    <>
      <div ref={ref}>
        <svg data-testid="svg" tabIndex={0} {...handlers} />
        <output data-testid="active">{String(active)}</output>
      </div>
      <button type="button" data-testid="outside" />
    </>
  )
}

const svg = () => screen.getByTestId('svg')
const active = () => screen.getByTestId('active').textContent
const touchAt = (clientX: number, clientY = 0) => ({ clientX, clientY, pointerId: 1, pointerType: 'touch' })
const mouseAt = (clientX: number, clientY = 0) => ({ clientX, clientY, pointerId: 1, pointerType: 'mouse' })

function tapOutside() {
  const outside = screen.getByTestId('outside')
  fireEvent.pointerDown(outside, touchAt(0))
  fireEvent.pointerUp(outside, touchAt(0))
}

describe('useChartFocus pointer mapping', () => {
  it('picks the nearest step from where the pointer is along the screen matrix', () => {
    render(<Harness />)
    fireEvent.pointerDown(svg(), touchAt(210, 77))
    expect(active()).toBe('2')
    // The point is built from both coordinates, so a turned ancestor's matrix can use either.
    expect(points.at(-1)).toMatchObject({ x: 210, y: 77 })
  })

  it('picks from the pointer height when the chart is drawn a quarter turn, whatever its x is', () => {
    render(<Harness options={{ turn: 1 }} />)
    // The box is 400 tall from y=100, mapped onto a 400-unit axis: 330 is 230 units along.
    fireEvent.pointerDown(svg(), touchAt(9999, 330))
    expect(active()).toBe('2')
    fireEvent.pointerMove(svg(), touchAt(0, 460))
    expect(active()).toBe('4')
    // It never asks for the screen matrix, which not every engine builds the rotation into.
    expect(points).toHaveLength(0)
  })

  it('does nothing for a turned chart whose box has no height yet', () => {
    box = { top: 0, height: 0 }
    render(<Harness options={{ turn: 1 }} />)
    fireEvent.pointerDown(svg(), touchAt(0, 50))
    expect(active()).toBe('null')
  })

  it('does nothing when the svg has no screen matrix', () => {
    stub(SVGSVGElement.prototype, 'getScreenCTM', { value: () => null })
    render(<Harness />)
    fireEvent.pointerDown(svg(), touchAt(210))
    expect(active()).toBe('null')
  })

  it('reaches a limited distance for a hover and any distance for a finger that is down', () => {
    render(<Harness />)
    fireEvent.pointerMove(svg(), mouseAt(150))
    expect(active()).toBe('null')
    fireEvent.pointerMove(svg(), mouseAt(120))
    expect(active()).toBe('1')
    fireEvent.pointerDown(svg(), touchAt(150))
    expect(active()).toBe('1')
    fireEvent.pointerMove(svg(), touchAt(390))
    expect(active()).toBe('4')
  })

  it('has nothing to pick on a chart with no steps', () => {
    render(<Harness length={0} />)
    fireEvent.pointerDown(svg(), touchAt(10))
    expect(active()).toBe('null')
  })
})

describe('useChartFocus clearing', () => {
  it('clears when the mouse leaves, the chart loses focus, Escape is pressed or a tap lands outside', () => {
    render(<Harness />)
    fireEvent.keyDown(svg(), { key: 'End' })
    expect(active()).toBe('4')

    fireEvent.pointerLeave(svg(), mouseAt(0))
    expect(active()).toBe('null')

    fireEvent.keyDown(svg(), { key: 'End' })
    fireEvent.blur(svg())
    expect(active()).toBe('null')

    fireEvent.keyDown(svg(), { key: 'Home' })
    fireEvent.keyDown(svg(), { key: 'Escape' })
    expect(active()).toBe('null')

    fireEvent.keyDown(svg(), { key: 'Home' })
    tapOutside()
    expect(active()).toBe('null')
  })

  it('leaves the focus when a finger leaves, which only a mouse does on purpose', () => {
    render(<Harness />)
    fireEvent.keyDown(svg(), { key: 'End' })
    fireEvent.pointerLeave(svg(), touchAt(0))
    expect(active()).toBe('4')
  })
})
