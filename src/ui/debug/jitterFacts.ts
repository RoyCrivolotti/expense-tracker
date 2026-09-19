interface Range {
  min: number
  max: number
}

const newRange = (): Range => ({ min: Infinity, max: -Infinity })

function note(range: Range, value: number): void {
  const v = Math.round(value * 10) / 10
  if (v < range.min) range.min = v
  if (v > range.max) range.max = v
}

const show = (range: Range): string =>
  range.min > range.max ? 'n/a' : range.min === range.max ? `${range.min}` : `${range.min} to ${range.max}`

/** A zero-width fixed box whose height is a safe-area inset, measured rather than read back from env(). */
function insetProbe(edge: 'top' | 'bottom'): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText = `position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-${edge},0px)`
  document.body.append(el)
  return el
}

/** UA tokens that identify the OS and the Safari build (iOS 26 freezes the OS token at 18_6). */
export function describeEnvironment(): string {
  const ua = navigator.userAgent
  const os = /OS (\d+[_\d]*) like Mac/.exec(ua)?.[1] ?? '?'
  const safari = /Version\/(\d+(?:\.\d+)*)/.exec(ua)?.[1] ?? 'none (web app view)'
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  return `mode      ${standalone ? 'home-screen app' : 'browser'}
os token  ${os}
safari    ${safari}
dpr       ${window.devicePixelRatio}`
}

export interface FactsSampler {
  report: () => string
  reset: () => void
  stop: () => void
}

/**
 * Tracks how far the viewport numbers move while the page scrolls. Ranges are kept in
 * memory only: writing to the DOM during a scroll would itself cause the commits this lab
 * is trying to rule in or out, so the readout is built on demand.
 */
export function startFactsSampler(): FactsSampler {
  const top = insetProbe('top')
  const bottom = insetProbe('bottom')
  const r = {
    innerH: newRange(),
    vvH: newRange(),
    vvTop: newRange(),
    insetTop: newRange(),
    insetBottom: newRange(),
    scrollY: newRange(),
  }
  const reset = () => {
    for (const range of Object.values(r)) Object.assign(range, newRange())
  }
  const sample = () => {
    const vv = window.visualViewport
    note(r.innerH, window.innerHeight)
    if (vv) {
      note(r.vvH, vv.height)
      note(r.vvTop, vv.offsetTop)
    }
    note(r.insetTop, top.offsetHeight)
    note(r.insetBottom, bottom.offsetHeight)
    note(r.scrollY, window.scrollY)
  }
  sample()
  const timer = window.setInterval(sample, 200)
  window.visualViewport?.addEventListener('resize', sample)
  return {
    reset,
    report: () => {
      sample()
      return `inner h   ${show(r.innerH)}
vv h      ${show(r.vvH)}
vv top    ${show(r.vvTop)}
inset top ${show(r.insetTop)}
inset bot ${show(r.insetBottom)}
scrollY   ${show(r.scrollY)}`
    },
    stop: () => {
      window.clearInterval(timer)
      window.visualViewport?.removeEventListener('resize', sample)
      top.remove()
      bottom.remove()
    },
  }
}
