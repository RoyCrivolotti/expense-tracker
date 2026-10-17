/**
 * The geometry behind the windowed Transactions list: where every day group and row sits, and
 * which of them a stretch of the page touches. Pure, so it needs no browser; the DOM side is in
 * useWindowedList.ts. Positions are px from the top of the list.
 */

/**
 * A list up to this long is rendered whole, as it always was: windowing has its costs (find in
 * the page cannot see rows that are not there) and a month of transactions is nowhere near
 * needing it.
 */
export const WINDOW_FROM_ROWS = 300

export interface LayoutInput {
  /** Rows in each day group, in list order. */
  groupSizes: readonly number[]
  /** A folded group takes only its header. */
  collapsed: readonly boolean[]
  /** Height of the row at this position in the whole list. */
  rowHeight: (flatIndex: number) => number
  headerHeight: number
  /** The space between day groups. */
  gap: number
}

export interface Layout {
  groupTop: Float64Array
  groupBottom: Float64Array
  /** Where each group's rows start in the whole list, with the total at the end. */
  firstRow: Int32Array
  rowTop: Float64Array
  rowEnd: Float64Array
  collapsed: readonly boolean[]
  /** What a group's own header takes, above its rows. */
  headerHeight: number
  total: number
}

export function buildLayout(input: LayoutInput): Layout {
  const { groupSizes, collapsed, rowHeight, headerHeight, gap } = input
  const groups = groupSizes.length
  const firstRow = new Int32Array(groups + 1)
  for (let g = 0; g < groups; g++) firstRow[g + 1] = firstRow[g]! + groupSizes[g]!
  const rows = firstRow[groups]!
  const layout: Layout = {
    groupTop: new Float64Array(groups),
    groupBottom: new Float64Array(groups),
    firstRow,
    rowTop: new Float64Array(rows),
    rowEnd: new Float64Array(rows),
    collapsed,
    headerHeight,
    total: 0,
  }
  let y = 0
  for (let g = 0; g < groups; g++) {
    layout.groupTop[g] = y
    y += headerHeight
    for (let i = firstRow[g]!; i < firstRow[g + 1]!; i++) {
      layout.rowTop[i] = y
      if (!collapsed[g]) y += rowHeight(i)
      layout.rowEnd[i] = y
    }
    layout.groupBottom[g] = y
    y += gap
  }
  layout.total = groups > 0 ? y - gap : 0
  return layout
}

/** The rows of one group to render, and the height that stands in for the ones left out. */
export interface RowSlice {
  /** Positions within the group, `from` up to but not including `to`. */
  from: number
  to: number
  before: number
  after: number
}

export const NO_ROWS: RowSlice = { from: 0, to: 0, before: 0, after: 0 }

export interface GroupPlan {
  group: number
  slice: RowSlice
}

export interface Plan {
  groups: GroupPlan[]
  /** The height of the groups above the first one rendered, and below the last. */
  top: number
  bottom: number
}

/** The first position in [lo, hi) holding something above `value`. */
function firstAbove(values: Float64Array, value: number, lo: number, hi: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (values[mid]! > value) hi = mid
    else lo = mid + 1
  }
  return lo
}

/** The first position in [lo, hi) holding `value` or more. */
function firstAtLeast(values: Float64Array, value: number, lo: number, hi: number): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (values[mid]! >= value) hi = mid
    else lo = mid + 1
  }
  return lo
}

function sliceOf(layout: Layout, group: number, from: number, to: number): RowSlice {
  const first = layout.firstRow[group]!
  const end = layout.firstRow[group + 1]!
  if (layout.collapsed[group] || first === end) return NO_ROWS
  const start = layout.groupTop[group]! + layout.headerHeight
  const a = firstAbove(layout.rowEnd, from, first, end)
  const b = Math.max(a, firstAtLeast(layout.rowTop, to, first, end))
  const before = (a < end ? layout.rowTop[a]! : layout.groupBottom[group]!) - start
  const after = a === b ? layout.groupBottom[group]! - start - before : layout.groupBottom[group]! - layout.rowEnd[b - 1]!
  return { from: a - first, to: b - first, before, after }
}

/** What to render for the stretch of the list from `from` to `to`. */
export function planWindow(layout: Layout, from: number, to: number): Plan {
  const groups = layout.groupTop.length
  const first = firstAbove(layout.groupBottom, from, 0, groups)
  const last = firstAtLeast(layout.groupTop, to, 0, groups) - 1
  if (first > last) return { groups: [], top: layout.total, bottom: 0 }
  const planned: GroupPlan[] = []
  for (let g = first; g <= last; g++) planned.push({ group: g, slice: sliceOf(layout, g, from, to) })
  return {
    groups: planned,
    top: layout.groupTop[first]!,
    bottom: layout.total - layout.groupBottom[last]!,
  }
}

/** The stretch of the list that is rendered: the part on screen and room to scroll either way. */
export interface Band {
  from: number
  to: number
}

const MIN_OVERSCAN_PX = 600
const OVERSCAN_VIEWPORTS = 1.2

function overscanFor(viewportHeight: number): number {
  return Math.max(MIN_OVERSCAN_PX, viewportHeight * OVERSCAN_VIEWPORTS)
}

/**
 * The band to render for a screen showing the list from `top` to `bottom`. It is kept until the
 * screen comes within half the overscan of its edge, so a slow scroll re-renders every few rows
 * rather than on each one. An edge that already reaches the end of the list has nothing more to
 * bring in, so being close to it is no reason to start again.
 */
export function nextBand(prev: Band | null, top: number, bottom: number, total: number): Band {
  const overscan = overscanFor(bottom - top)
  const margin = overscan / 2
  if (prev) {
    const above = prev.from <= 0 ? top >= prev.from : top - prev.from >= margin
    const below = prev.to >= total ? bottom <= prev.to : prev.to - bottom >= margin
    if (above && below) return prev
  }
  return { from: top - overscan, to: bottom + overscan }
}
