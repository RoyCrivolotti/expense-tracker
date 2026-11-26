import { pointSeriesValueAt } from './linearScale'
import { valueAtPlace } from './steppedPoints'

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
  /** A projection drawn dotted (the plan from today): the same colour as its plan, so it is told apart by its edge. */
  dotted: boolean
}

/** How a chart is asked to tag the values of its lines at the year pointed at. */
export interface ValueTagSpec {
  format: (value: number) => string
  /** The text colour that reads on a tag filled with `color`. */
  textOn: (color: string) => string
  /** The return each edge of the band stands for, written for the chip ("3,0%", "9,0%"). */
  bandLabels?: { lo: string; hi: string }
}

/**
 * Lines that read the same figure at this year (to the precision the tag is written in) are one
 * tag with a dot for each, level with where they are, so a scenario and its copy do not take a
 * place each. Two figures that differ in the last place they are written to are not merged.
 */
function mergeEqual(tags: ValueTag[]): ValueTag[] {
  const out: ValueTag[] = []
  for (const tag of tags) {
    const same = tag.band || tag.dotted ? undefined : out.find((o) => !o.band && !o.dotted && o.text === tag.text)
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

interface TaggedLine {
  id: string
  color: string
  values: number[]
  preStep?: number[] | undefined
  xs?: number[] | undefined
}

interface TaggedPoints {
  id: string
  color: string
  points: { xIndex: number; value: number }[]
}

interface TaggedBand {
  color: string
  band?: { lo: number[]; hi: number[]; loPre?: number[] | undefined; hiPre?: number[] | undefined } | undefined
  xs?: number[] | undefined
}

/** The over and under edge of each band at the year `active`, when the chart has words for them. */
function bandTags(
  active: number,
  bands: TaggedBand[],
  scaleY: (value: number) => number,
  spec: ValueTagSpec,
): ValueTag[] {
  const labels = spec.bandLabels
  if (!labels) return []
  const tags: ValueTag[] = []
  for (const [k, band] of bands.entries()) {
    const edges = band.band
    const lo = edges ? valueAtPlace({ values: edges.lo, preStep: edges.loPre, xs: band.xs }, active) : undefined
    const hi = edges ? valueAtPlace({ values: edges.hi, preStep: edges.hiPre, xs: band.xs }, active) : undefined
    if (lo === undefined || hi === undefined) continue
    tags.push({
      id: `band-hi-${k}`,
      color: band.color,
      colors: [band.color],
      y: scaleY(hi),
      text: `${labels.hi} · ${spec.format(hi)}`,
      band: true,
      dotted: false,
    })
    tags.push({
      id: `band-lo-${k}`,
      color: band.color,
      colors: [band.color],
      y: scaleY(lo),
      text: `${labels.lo} · ${spec.format(lo)}`,
      band: true,
      dotted: false,
    })
  }
  return tags
}

/** The tags for the year `active`: one per line that has a value there, and the band's two edges. */
export function buildTags(
  active: number,
  lines: TaggedLine[],
  bands: TaggedBand[],
  pointLines: TaggedPoints[],
  scaleY: (value: number) => number,
  spec: ValueTagSpec,
): ValueTag[] {
  const tags: ValueTag[] = []
  for (const line of lines) {
    const value = valueAtPlace(line, active)
    // A line that has ended, or not started, has no point at this year, and so no tag.
    if (value === undefined) continue
    tags.push({
      id: line.id,
      color: line.color,
      colors: [line.color],
      y: scaleY(value),
      text: spec.format(value),
      band: false,
      dotted: false,
    })
  }
  for (const line of pointLines) {
    // The line starts at the latest check-in and has no value before it, so no tag there.
    const value = pointSeriesValueAt(line.points, active)
    if (value === null) continue
    tags.push({
      id: line.id,
      color: line.color,
      colors: [line.color],
      y: scaleY(value),
      text: spec.format(value),
      band: false,
      dotted: true,
    })
  }
  tags.push(...bandTags(active, bands, scaleY, spec))
  return mergeEqual(tags)
}
