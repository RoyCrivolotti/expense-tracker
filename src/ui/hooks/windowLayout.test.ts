import { describe, expect, it } from 'vitest'
import { buildLayout, nextBand, NO_ROWS, planWindow, type Layout, type Plan } from './windowLayout'

const HEADER = 5
const GAP = 2
const ROW = 10

function layoutOf(sizes: number[], collapsed: boolean[] = sizes.map(() => false), rowHeight = ROW): Layout {
  return buildLayout({ groupSizes: sizes, collapsed, rowHeight: () => rowHeight, headerHeight: HEADER, gap: GAP })
}

/** The height the plan would give the page: what it renders plus the padding standing in for the rest. */
function renderedHeight(layout: Layout, plan: Plan): number {
  let height = plan.top + plan.bottom
  plan.groups.forEach(({ group, slice }, i) => {
    const rows = layout.collapsed[group] ? 0 : layout.groupBottom[group]! - layout.groupTop[group]! - HEADER
    const shown = layout.collapsed[group] ? 0 : (slice.to - slice.from) * ROW
    expect(slice.before + shown + slice.after).toBe(rows)
    height += HEADER + rows + (i > 0 ? GAP : 0)
  })
  return height
}

describe('buildLayout', () => {
  it('stacks headers, rows and the gap between days', () => {
    const layout = layoutOf([2, 3])
    expect(Array.from(layout.groupTop)).toEqual([0, 27])
    expect(Array.from(layout.groupBottom)).toEqual([25, 62])
    expect(Array.from(layout.rowTop)).toEqual([5, 15, 32, 42, 52])
    expect(Array.from(layout.rowEnd)).toEqual([15, 25, 42, 52, 62])
    expect(Array.from(layout.firstRow)).toEqual([0, 2, 5])
    expect(layout.total).toBe(62)
  })

  it('gives a folded day only its header, and the rows after it the space', () => {
    const layout = layoutOf([2, 3], [true, false])
    expect(Array.from(layout.groupBottom)).toEqual([5, 42])
    expect(layout.groupTop[1]).toBe(7)
    expect(layout.total).toBe(42)
  })

  it('asks for each row by its place in the whole list', () => {
    const asked: number[] = []
    buildLayout({
      groupSizes: [1, 2],
      collapsed: [false, false],
      rowHeight: (i) => {
        asked.push(i)
        return i + 1
      },
      headerHeight: 0,
      gap: 0,
    })
    expect(asked).toEqual([0, 1, 2])
  })

  it('is empty for an empty list', () => {
    expect(layoutOf([]).total).toBe(0)
  })
})

describe('planWindow', () => {
  it('renders everything when the window covers the list', () => {
    const layout = layoutOf([2, 3])
    const plan = planWindow(layout, -100, 500)
    expect(plan.top).toBe(0)
    expect(plan.bottom).toBe(0)
    expect(plan.groups).toEqual([
      { group: 0, slice: { from: 0, to: 2, before: 0, after: 0 } },
      { group: 1, slice: { from: 0, to: 3, before: 0, after: 0 } },
    ])
  })

  it('renders only the rows the window touches, with the rest as padding either side', () => {
    const layout = layoutOf([10])
    // Rows are 10px from y=5, so 40..60 touches rows 3 (35-45), 4 and 5 (55-65).
    const plan = planWindow(layout, 40, 60)
    expect(plan.groups).toEqual([{ group: 0, slice: { from: 3, to: 6, before: 30, after: 40 } }])
    expect(plan.top).toBe(0)
    expect(plan.bottom).toBe(0)
  })

  it('leaves whole days out as padding above and below', () => {
    const layout = layoutOf([2, 2, 2, 2])
    // Days start at 0, 27, 54 and 81, each 25 tall.
    const plan = planWindow(layout, 60, 70)
    expect(plan.groups.map((g) => g.group)).toEqual([2])
    expect(plan.top).toBe(54)
    expect(plan.bottom).toBe(layout.total - 79)
  })

  it('keeps a day whose header is on screen even when none of its rows are', () => {
    const layout = layoutOf([3, 3])
    // The second day's header is 37-42, and its rows start below that.
    const plan = planWindow(layout, 38, 40)
    expect(plan.groups).toEqual([{ group: 1, slice: { from: 0, to: 0, before: 0, after: 30 } }])
  })

  it('renders no rows for a folded day', () => {
    const layout = layoutOf([3, 3], [true, false])
    const plan = planWindow(layout, 0, 30)
    expect(plan.groups[0]).toEqual({ group: 0, slice: NO_ROWS })
    expect(plan.groups[1]?.group).toBe(1)
  })

  it('renders nothing, and pads the whole list, when the window is past either end', () => {
    const layout = layoutOf([2])
    expect(planWindow(layout, 1000, 2000)).toEqual({ groups: [], top: layout.total, bottom: 0 })
    expect(planWindow(layout, -50, -10)).toEqual({ groups: [], top: layout.total, bottom: 0 })
  })

  it('accounts for every pixel of the list, wherever the window is', () => {
    const layout = layoutOf([4, 1, 0, 6, 3, 8], [false, false, false, true, false, false])
    for (let from = -20; from < layout.total + 20; from += 7) {
      for (const size of [1, 12, 40, 300]) {
        const plan = planWindow(layout, from, from + size)
        if (plan.groups.length > 0) expect(renderedHeight(layout, plan)).toBe(layout.total)
      }
    }
  })

  it('treats a day with no rows as just a header', () => {
    const layout = layoutOf([0, 2])
    const plan = planWindow(layout, 0, 10)
    expect(plan.groups[0]).toEqual({ group: 0, slice: NO_ROWS })
  })
})

describe('nextBand', () => {
  const total = 100_000

  it('opens a band around the screen, at least 600px each way', () => {
    expect(nextBand(null, 1000, 1300, total)).toEqual({ from: 400, to: 1900 })
  })

  it('scales the band with a tall screen', () => {
    expect(nextBand(null, 1000, 3000, total)).toEqual({ from: -1400, to: 5400 })
  })

  it('keeps the band while the screen is well inside it', () => {
    const band = nextBand(null, 1000, 1300, total)
    expect(nextBand(band, 1100, 1400, total)).toBe(band)
    expect(nextBand(band, 800, 1100, total)).toBe(band)
  })

  it('opens a new band once the screen is within half the overscan of an edge', () => {
    const band = nextBand(null, 1000, 1300, total)
    expect(nextBand(band, 1301, 1601, total)).toEqual({ from: 701, to: 2201 })
    expect(nextBand(band, 699, 999, total)).toEqual({ from: 99, to: 1599 })
  })

  it('opens a new band when the screen jumps clear out of the old one', () => {
    const band = nextBand(null, 1000, 1300, total)
    expect(nextBand(band, 50_000, 50_300, total)).toEqual({ from: 49_400, to: 50_900 })
  })

  it('has nothing more to bring in past either end of the list', () => {
    const start = nextBand(null, 0, 300, 5000)
    expect(start.from).toBeLessThan(0)
    expect(nextBand(start, 0, 300, 5000)).toBe(start)
    expect(nextBand(start, 200, 500, 5000)).toBe(start)
    const end = nextBand(null, 4700, 5000, 5000)
    expect(end.to).toBeGreaterThanOrEqual(5000)
    expect(nextBand(end, 4800, 5100, 5000)).toBe(end)
    expect(nextBand(end, 5000, 5300, 5000)).toBe(end)
  })
})
