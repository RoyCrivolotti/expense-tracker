import { afterEach, describe, expect, it } from 'vitest'
import { sampleViewport, verdict, viewportDebugRequested } from './viewportProbe'

function setViewport(value: unknown) {
  Object.defineProperty(window, 'visualViewport', { configurable: true, value })
}

function setSearch(search: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  })
}

afterEach(() => {
  setViewport(undefined)
  setSearch('')
  document.body.innerHTML = ''
})

describe('viewportDebugRequested', () => {
  it('is off unless explicitly asked for', () => {
    setSearch('')
    expect(viewportDebugRequested()).toBe(false)
    setSearch('?viewportDebug=0')
    expect(viewportDebugRequested()).toBe(false)
  })

  it('is on with the flag', () => {
    setSearch('?viewportDebug=1')
    expect(viewportDebugRequested()).toBe(true)
    setSearch('?other=x&viewportDebug=1')
    expect(viewportDebugRequested()).toBe(true)
  })
})

describe('sampleViewport', () => {
  it('reports the visual viewport when present', () => {
    setViewport({ offsetTop: 120, offsetLeft: 0, height: 424, width: 390, pageTop: 120 })
    const s = sampleViewport()
    expect(s.visual).toEqual({ offsetTop: 120, offsetLeft: 0, height: 424, width: 390, pageTop: 120 })
  })

  it('reports null rather than throwing where the API is missing', () => {
    setViewport(undefined)
    expect(sampleViewport().visual).toBeNull()
  })

  it('leaves no probe elements behind', () => {
    setViewport({ offsetTop: 0, offsetLeft: 0, height: 800, width: 400, pageTop: 0 })
    sampleViewport()
    sampleViewport()
    // Two throwaway elements per sample would otherwise accumulate for the life
    // of the page, since this runs on every viewport event.
    expect(document.body.children.length).toBe(0)
  })

  it('skips zero-height matches, which the collapsed batch pane produces', () => {
    setViewport({ offsetTop: 0, offsetLeft: 0, height: 800, width: 400, pageTop: 0 })
    const hidden = document.createElement('div')
    hidden.setAttribute('role', 'dialog')
    hidden.getBoundingClientRect = () => ({ top: 0, bottom: 0, height: 0 }) as DOMRect
    const real = document.createElement('div')
    real.setAttribute('role', 'dialog')
    real.getBoundingClientRect = () => ({ top: 184, bottom: 544, height: 360 }) as DOMRect
    document.body.append(hidden, real)

    expect(sampleViewport().elements.sheet).toBe('184..544 (h360)')
  })

  it('reports an em dash for anything not on screen', () => {
    setViewport({ offsetTop: 0, offsetLeft: 0, height: 800, width: 400, pageTop: 0 })
    expect(sampleViewport().elements.popover).toBe('—')
  })
})

describe('verdict', () => {
  const base = { buildId: 'x', innerHeight: 844, innerWidth: 390, safeAreaTop: 0, bodyPosition: '', bodyTop: '', elements: {} }
  const withPan = (offsetTop: number, fixedTopRect: number) => ({
    ...base,
    visual: { offsetTop, offsetLeft: 0, height: 424, width: 390, pageTop: offsetTop },
    fixedTopRect,
  })

  it('asks for a keyboard while nothing has panned', () => {
    expect(verdict(withPan(0, 0))).toMatch(/no pan yet/)
  })

  it('calls a fixed element reading 0 under a pan layout-relative', () => {
    // Blink's behaviour, and what the headless run reports.
    expect(verdict(withPan(120, 0))).toMatch(/LAYOUT-relative/)
  })

  it('calls a fixed element reading -offsetTop visual-relative', () => {
    // The hypothesis this exists to test: on WebKit the rect would be -120.
    expect(verdict(withPan(120, -120))).toMatch(/VISUAL-relative/)
  })

  it('tolerates a pixel of rounding either way', () => {
    expect(verdict(withPan(120, -119))).toMatch(/VISUAL-relative/)
  })

  it('flags anything that matches neither model rather than guessing', () => {
    expect(verdict(withPan(120, -40))).toMatch(/UNEXPECTED/)
  })
})
