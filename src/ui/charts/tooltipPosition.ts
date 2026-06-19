export interface ViewportBounds {
  minLeft: number
  maxRight: number
  minTop: number
  maxBottom: number
}

const EDGE_PAD = 10

/** Visible viewport with safe-area padding (for fixed tooltip placement). */
export function viewportBounds(): ViewportBounds {
  const vv = window.visualViewport
  const offsetLeft = vv?.offsetLeft ?? 0
  const offsetTop = vv?.offsetTop ?? 0
  const width = vv?.width ?? document.documentElement.clientWidth
  const height = vv?.height ?? document.documentElement.clientHeight
  const safeLeft = readSafeInset('left')
  const safeRight = readSafeInset('right')
  const safeTop = readSafeInset('top')
  return {
    minLeft: offsetLeft + EDGE_PAD + safeLeft,
    maxRight: offsetLeft + width - EDGE_PAD - safeRight,
    minTop: offsetTop + EDGE_PAD + safeTop,
    maxBottom: offsetTop + height - EDGE_PAD,
  }
}

function readSafeInset(side: 'left' | 'right' | 'top'): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(`env(safe-area-inset-${side})`)
    .trim()
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : 0
}

export function clampTooltipLeft(centerX: number, width: number, bounds: ViewportBounds): number {
  const half = width / 2
  const minLeft = bounds.minLeft
  const maxLeft = Math.max(minLeft, bounds.maxRight - width)
  return Math.min(Math.max(centerX - half, minLeft), maxLeft)
}

export function clampTooltipTop(
  anchorY: number,
  height: number,
  bounds: ViewportBounds,
  gap = 8,
): number {
  const above = anchorY - height - gap
  if (above >= bounds.minTop) return above
  return Math.min(anchorY + gap, bounds.maxBottom - height)
}
