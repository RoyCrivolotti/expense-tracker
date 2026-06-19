export const CHART_W = 360
export const CHART_H = 200
export const PAD = { top: 18, right: 16, bottom: 34, left: 60 } as const

export function monthLabel(ym: string): string {
  const [, m] = ym.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return names[Number(m) - 1] ?? ym
}

/** Round up to a readable axis maximum. */
export function chartMax(values: number[]): number {
  const peak = Math.max(1, ...values)
  const mag = 10 ** Math.floor(Math.log10(peak))
  const norm = peak / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}

export function yTickValues(maxVal: number, count = 5): number[] {
  const ticks: number[] = []
  for (let i = 0; i < count; i++) {
    ticks.push(Math.round((maxVal * i) / (count - 1)))
  }
  return ticks
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
