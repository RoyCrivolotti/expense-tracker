/** What a value tag says and where its line is, before the tags are laid out against each other. */
export interface ValueTag {
  id: string
  /** The line's colour; for a merged tag, the first line's. */
  color: string
  /** More than one when lines read the same at this year: one tag with a dot for each. */
  colors: string[]
  /** Where the line is at the year pointed at, in the chart's pixels. */
  y: number
  text: string
  /** The over or under edge of the shaded band, not a line. */
  band: boolean
}

/** How a chart is asked to tag the values of its lines at the year pointed at. */
export interface ValueTagSpec {
  format: (value: number) => string
  /** The text colour that reads on a tag filled with `color`. */
  textOn: (color: string) => string
  /** The return each edge of the band stands for, written for the chip ("3,0%", "9,0%"). */
  bandLabels?: { lo: string; hi: string }
}

export const TAG_HEIGHT = 18
/** Centre to centre: a tag and a gap of 1px. */
export const TAG_PITCH = 19
/** Between the focused year's dots and the tags beside them. */
export const TAG_OFFSET = 10
/** Room for each dot in a merged tag (the dot and the gap after it). */
export const DOT_ROOM = 13
const TAG_MIN_WIDTH = 54
const CHAR_WIDTH = 6.7
const TAG_PADDING = 18

export function tagWidth(text: string, dots = 1): number {
  const textWidth = Math.max(TAG_MIN_WIDTH, Math.round(text.length * CHAR_WIDTH + TAG_PADDING))
  return dots > 1 ? textWidth + dots * DOT_ROOM : textWidth
}

/**
 * Lines that read the same figure at this year (to the precision the tag is written in) are one
 * tag with a dot for each, level with where they are, so a scenario and its copy do not take a
 * place each. Two figures that differ in the last place they are written to are not merged.
 */
function mergeEqual(tags: ValueTag[]): ValueTag[] {
  const out: ValueTag[] = []
  for (const tag of tags) {
    const same = tag.band ? undefined : out.find((o) => !o.band && o.text === tag.text)
    if (!same) {
      out.push({ ...tag })
      continue
    }
    const n = same.colors.length
    same.y = (same.y * n + tag.y) / (n + 1)
    same.colors = [...same.colors, tag.color]
    same.id = `${same.id}+${tag.id}`
  }
  return out
}

interface Block {
  ids: number[]
  sum: number
}

/** Where the first tag of a block of `n` sits: the block centred on what it was asked for, kept inside the plot. */
function blockStart(block: Block, pitch: number, min: number, max: number): number {
  const n = block.ids.length
  const span = (n - 1) * pitch
  const centred = block.sum / n - span / 2
  return Math.max(min, Math.min(max - span, centred))
}

/**
 * The centres to draw tags at, given the centres they were asked for (their lines' values): in
 * the order of the lines, at least `pitch` apart, and inside `min`..`max`. Tags that would overlap
 * are moved together as a block centred on where they were asked for, so no tag is pushed far
 * from its own line while others stay put.
 */
export function spreadTags(asked: number[], pitch: number, min: number, max: number): number[] {
  const order = asked.map((_, i) => i).sort((a, b) => asked[a]! - asked[b]!)
  let blocks: Block[] = order.map((i) => ({ ids: [i], sum: asked[i]! }))
  let merged = true
  while (merged) {
    merged = false
    for (let k = 1; k < blocks.length; k++) {
      const prev = blocks[k - 1]!
      const next = blocks[k]!
      const prevLast = blockStart(prev, pitch, min, max) + (prev.ids.length - 1) * pitch
      if (prevLast + pitch > blockStart(next, pitch, min, max) + 0.001) {
        blocks = [...blocks.slice(0, k - 1), { ids: [...prev.ids, ...next.ids], sum: prev.sum + next.sum }, ...blocks.slice(k + 1)]
        merged = true
        break
      }
    }
  }
  const out = new Array<number>(asked.length)
  for (const block of blocks) {
    const start = blockStart(block, pitch, min, max)
    block.ids.forEach((id, k) => {
      out[id] = start + k * pitch
    })
  }
  return out
}

interface TaggedLine {
  id: string
  color: string
  values: number[]
}

interface TaggedBand {
  color: string
  band?: { lo: number[]; hi: number[] } | undefined
}

/** The tags for the year `active`: one per line that has a value there, and the band's two edges. */
export function buildTags(
  active: number,
  lines: TaggedLine[],
  bands: TaggedBand[],
  scaleY: (value: number) => number,
  spec: ValueTagSpec,
): ValueTag[] {
  const tags: ValueTag[] = []
  for (const line of lines) {
    const value = line.values[active]
    // A line that has ended has no point at this year, and so no tag.
    if (value === undefined) continue
    tags.push({ id: line.id, color: line.color, colors: [line.color], y: scaleY(value), text: spec.format(value), band: false })
  }
  const labels = spec.bandLabels
  if (labels) {
    for (const [k, band] of bands.entries()) {
      const lo = band.band?.lo[active]
      const hi = band.band?.hi[active]
      if (lo === undefined || hi === undefined) continue
      tags.push({ id: `band-hi-${k}`, color: band.color, colors: [band.color], y: scaleY(hi), text: `${labels.hi} · ${spec.format(hi)}`, band: true })
      tags.push({ id: `band-lo-${k}`, color: band.color, colors: [band.color], y: scaleY(lo), text: `${labels.lo} · ${spec.format(lo)}`, band: true })
    }
  }
  return mergeEqual(tags)
}

export interface PlacedTag {
  tag: ValueTag
  x: number
  y: number
  width: number
}

/**
 * Where each tag is drawn: beside the dots on their right, or on their left where the right has
 * no room (the last years of the plan). `x` is the tag's left edge.
 */
export function placeTags(tags: ValueTag[], focusX: number, chartWidth: number, yTop: number, yBottom: number): PlacedTag[] {
  const widths = tags.map((t) => tagWidth(t.text, t.colors.length))
  const widest = Math.max(0, ...widths)
  const onLeft = focusX + TAG_OFFSET + widest > chartWidth - 2
  const ys = spreadTags(tags.map((t) => t.y), TAG_PITCH, yTop + TAG_HEIGHT / 2, yBottom - TAG_HEIGHT / 2)
  return tags.map((tag, i) => {
    const width = widths[i]!
    return { tag, x: onLeft ? focusX - TAG_OFFSET - width : focusX + TAG_OFFSET, y: ys[i]!, width }
  })
}
