/**
 * Live viewport geometry, for reading off a real device.
 *
 * Every fix attempted at this overlay so far was built from a hypothesis that
 * could not be tested here: no environment available to the project has a
 * software keyboard, and none pans a visual viewport. This exists so the next
 * change is driven by numbers from the phone rather than by inference from a
 * screenshot.
 */
/** Opt-in via `?viewportDebug=1`, so nothing renders on a normal load. */
export function viewportDebugRequested(): boolean {
  return new URLSearchParams(window.location.search).get('viewportDebug') === '1'
}

export interface ViewportSample {
  buildId: string
  /** null when the browser has no visualViewport at all. */
  visual: { offsetTop: number; offsetLeft: number; height: number; width: number; pageTop: number } | null
  innerHeight: number
  innerWidth: number
  safeAreaTop: number
  /**
   * `getBoundingClientRect().top` of an element pinned at `position: fixed;
   * top: 0`.
   *
   * **This is the decisive measurement.** On a browser whose client
   * coordinates are layout-viewport relative it reads 0 even while the
   * keyboard has panned the screen. If it reads `-offsetTop`, client rects are
   * *visual*-viewport relative, and every trigger rect compared against a
   * fixed-positioned band needs `+offsetTop` first — which is what Floating UI
   * does, gated on WebKit and fixed positioning.
   */
  fixedTopRect: number
  bodyPosition: string
  bodyTop: string
  elements: Record<string, string>
}

/** Elements worth measuring, by a selector that survives CSS-module hashing. */
const TRACKED: Record<string, string> = {
  overlay: '[role="presentation"]',
  sheet: '[role="dialog"]',
  flagTrigger: 'button[class*="trigger"]',
  popover: '[aria-label="Choose a flag"]',
}

function rectOf(selector: string): string {
  // First match with a real box: the batch-add pane stays mounted but collapsed,
  // so several of these selectors also hit a zero-height twin.
  const el = [...document.querySelectorAll(selector)].find(
    (candidate) => candidate.getBoundingClientRect().height > 0,
  )
  if (!el) return '—'
  const r = el.getBoundingClientRect()
  return `${Math.round(r.top)}..${Math.round(r.bottom)} (h${Math.round(r.height)})`
}

/**
 * Measures with two throwaway elements rather than reading CSS: `env()` is not
 * reachable from script, and a custom property holding it hands back a token
 * stream that WebKit does not always resolve.
 */
export function sampleViewport(): ViewportSample {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top,0px);' +
    'visibility:hidden;pointer-events:none'
  const pinned = document.createElement('div')
  pinned.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;visibility:hidden;pointer-events:none'
  document.body.append(probe, pinned)
  const safeAreaTop = probe.getBoundingClientRect().height
  const fixedTopRect = pinned.getBoundingClientRect().top
  probe.remove()
  pinned.remove()

  const vv = window.visualViewport
  const elements: Record<string, string> = {}
  for (const [name, selector] of Object.entries(TRACKED)) elements[name] = rectOf(selector)

  return {
    buildId: import.meta.env.VITE_BUILD_ID ?? 'unknown',
    visual: vv
      ? {
          offsetTop: Math.round(vv.offsetTop),
          offsetLeft: Math.round(vv.offsetLeft),
          height: Math.round(vv.height),
          width: Math.round(vv.width),
          pageTop: Math.round(vv.pageTop),
        }
      : null,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    safeAreaTop,
    fixedTopRect: Math.round(fixedTopRect),
    bodyPosition: document.body.style.position || '(none)',
    bodyTop: document.body.style.top || '(none)',
    elements,
  }
}

/** What the decisive measurement means, spelled out so the screenshot is self-describing. */
export function verdict(sample: ViewportSample): string {
  const pan = sample.visual?.offsetTop ?? 0
  if (pan === 0) return 'no pan yet — open the keyboard'
  if (sample.fixedTopRect === 0) return `LAYOUT-relative rects (pan ${pan}, fixed reads 0)`
  if (Math.abs(sample.fixedTopRect + pan) <= 1) return `VISUAL-relative rects (fixed reads ${sample.fixedTopRect})`
  return `UNEXPECTED: pan ${pan}, fixed reads ${sample.fixedTopRect}`
}
