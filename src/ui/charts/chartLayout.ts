import { niceScale } from './linearScale'

export const CHART_W = 360
export const CHART_H = 200
export const PAD = { top: 18, right: 16, bottom: 34, left: 60 } as const

export function monthLabel(ym: string): string {
  const [, m] = ym.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return names[Number(m) - 1] ?? ym
}

/**
 * A zero-based axis over the values: its top, and the gridlines under it. The top stays close
 * to the data (see `niceScale`), so the bars are not squeezed into the lower half of a chart
 * whose ceiling is the next power-of-ten step.
 */
export function chartAxis(values: number[]): { max: number; ticks: number[] } {
  const { max, ticks } = niceScale(0, Math.max(1, ...values))
  return { max, ticks: [...new Set(ticks)] }
}

export function innerSize() {
  return {
    w: CHART_W - PAD.left - PAD.right,
    h: CHART_H - PAD.top - PAD.bottom,
  }
}

export function yAt(value: number, maxVal: number, innerH: number): number {
  return PAD.top + innerH - (value / maxVal) * innerH
}
