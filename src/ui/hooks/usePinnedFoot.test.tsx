import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PINNED_FOOT_AIR_PX, PINNED_FOOT_VAR, usePinnedFoot } from './usePinnedFoot'

/** The ResizeObserver callbacks registered, so a test can say the bar changed size. */
const resized: (() => void)[] = []

class FakeResizeObserver {
  private readonly callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
  }
  observe() {
    resized.push(this.callback)
  }
  disconnect() {
    resized.splice(resized.indexOf(this.callback), 1)
  }
}

let barHeight = 75

function Sheet({ pinned }: { pinned: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  usePinnedFoot(ref, pinned)
  return (
    <div role="dialog" data-testid="sheet">
      <form>
        <div ref={ref}>Buttons</div>
      </form>
    </div>
  )
}

const sheetVar = (sheet: HTMLElement) => sheet.style.getPropertyValue(PINNED_FOOT_VAR)

describe('usePinnedFoot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resized.length = 0
    barHeight = 75
  })

  function placeBar() {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() =>
      DOMRect.fromRect({ x: 0, y: 0, width: 375, height: barHeight }),
    )
  }

  it('keeps room at the foot of its sheet for the bar and some air', () => {
    placeBar()
    const { getByTestId } = render(<Sheet pinned />)

    expect(sheetVar(getByTestId('sheet'))).toBe(`${75 + PINNED_FOOT_AIR_PX}px`)
  })

  it('follows the bar as it grows with an error and shrinks back', () => {
    placeBar()
    const { getByTestId } = render(<Sheet pinned />)

    barHeight = 117
    resized.forEach((call) => call())
    expect(sheetVar(getByTestId('sheet'))).toBe(`${117 + PINNED_FOOT_AIR_PX}px`)

    barHeight = 75
    resized.forEach((call) => call())
    expect(sheetVar(getByTestId('sheet'))).toBe(`${75 + PINNED_FOOT_AIR_PX}px`)
  })

  it('keeps no room where the buttons are not pinned, and gives it back when the bar goes', () => {
    placeBar()
    const plain = render(<Sheet pinned={false} />)
    expect(sheetVar(plain.getByTestId('sheet'))).toBe('')
    expect(resized).toHaveLength(0)
    plain.unmount()

    const pinned = render(<Sheet pinned />)
    pinned.rerender(<Sheet pinned={false} />)
    expect(sheetVar(pinned.getByTestId('sheet'))).toBe('')
    expect(resized).toHaveLength(0)
  })

  it('still measures once where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() =>
      DOMRect.fromRect({ x: 0, y: 0, width: 375, height: 60 }),
    )
    const { getByTestId } = render(<Sheet pinned />)

    expect(sheetVar(getByTestId('sheet'))).toBe(`${60 + PINNED_FOOT_AIR_PX}px`)
  })
})

describe('the sheet’s room at its foot', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/ui/components/Modal.module.css'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )

  it('is the scroll padding at the sheet’s foot, none where no bar sets it', () => {
    expect(css).toMatch(new RegExp(`\\.sheet \\{\\s*scroll-padding-bottom: var\\(${PINNED_FOOT_VAR}, 0px\\);\\s*\\}`))
  })

  it('is dropped while a phone keyboard is up, when the bar steps aside', () => {
    expect(css).toMatch(/:global\(html\[data-keyboard-open\]\) \.sheet \{\s*scroll-padding-bottom: 0;\s*\}/)
  })
})
