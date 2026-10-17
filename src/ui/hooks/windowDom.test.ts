import { afterEach, describe, expect, it, vi } from 'vitest'
import { anchorShift, captureAnchor, readChrome, readSamples } from './windowDom'

function rect(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) }
}

function listOf(...rows: { key: string; shape?: number; top: number; height: number }[]) {
  const list = document.createElement('div')
  document.body.append(list)
  for (const row of rows) {
    const el = document.createElement('div')
    el.dataset.vrow = row.key
    el.dataset.shape = String(row.shape ?? 0)
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rect(row.top, row.height))
    list.append(el)
  }
  return list
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('readSamples', () => {
  it('reads each rendered row by its key, shape and height', () => {
    const list = listOf(
      { key: '7', shape: 1, top: 0, height: 84 },
      { key: '2:2026-06', shape: 9, top: 84, height: 70.5 },
    )
    expect(readSamples(list)).toEqual([
      { key: '7', shape: 1, height: 84 },
      { key: '2:2026-06', shape: 9, height: 70.5 },
    ])
  })
})

describe('readChrome', () => {
  function withHeader(height: number, rowGap: string) {
    const list = document.createElement('div')
    list.style.rowGap = rowGap
    const header = document.createElement('div')
    header.setAttribute('data-day-header', '')
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(rect(0, height))
    list.append(header)
    document.body.append(list)
    return list
  }

  it('reads the day header height and the gap between days', () => {
    expect(readChrome(withHeader(29, '16px'))).toEqual({ header: 29, gap: 16 })
  })

  it('has nothing to report without layout', () => {
    expect(readChrome(withHeader(0, '16px'))).toBeNull()
    expect(readChrome(withHeader(29, 'normal'))).toBeNull()
    expect(readChrome(document.createElement('div'))).toBeNull()
  })
})

describe('captureAnchor', () => {
  it('picks the first row that reaches the screen', () => {
    const list = listOf(
      { key: 'a', top: -200, height: 62 },
      { key: 'b', top: -62, height: 62 },
      { key: 'c', top: -20, height: 62 },
      { key: 'd', top: 42, height: 62 },
    )
    const anchor = captureAnchor(list)
    expect(anchor?.el.dataset.vrow).toBe('c')
    expect(anchor?.top).toBe(-20)
  })

  it('is null when no row reaches the screen', () => {
    expect(captureAnchor(listOf({ key: 'a', top: -100, height: 62 }))).toBeNull()
    expect(captureAnchor(listOf())).toBeNull()
  })
})

describe('anchorShift', () => {
  it('is how far down the screen the row has moved', () => {
    const list = listOf({ key: 'a', top: 100, height: 62 })
    const anchor = captureAnchor(list)
    vi.spyOn(anchor!.el, 'getBoundingClientRect').mockReturnValue(rect(130, 62))
    expect(anchorShift(anchor)).toBe(30)
  })

  it('is nothing for a row that has been removed, or no row at all', () => {
    const list = listOf({ key: 'a', top: 100, height: 62 })
    const anchor = captureAnchor(list)
    anchor!.el.remove()
    expect(anchorShift(anchor)).toBe(0)
    expect(anchorShift(null)).toBe(0)
  })
})
