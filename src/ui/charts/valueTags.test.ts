import { describe, expect, it } from 'vitest'
import { buildTags, type ValueTagSpec } from './valueTags'

const spec: ValueTagSpec = {
  format: (v) => `${v}`,
  textOn: () => '#fff',
  bandLabels: { lo: '3%', hi: '9%' },
}

describe('buildTags', () => {
  const scaleY = (v: number) => 200 - v
  const lines = [
    { id: 'a', color: '#111', values: [10, 20, 30] },
    { id: 'b', color: '#222', values: [10, 20] },
  ]

  it('has a tag for each line that has a value in the year, and none for one that has ended', () => {
    const tags = buildTags(2, lines, [], [], scaleY, spec)
    expect(tags.map((t) => t.id)).toEqual(['a'])
    expect(tags[0]).toMatchObject({ y: 170, text: '30', band: false })
  })

  it('adds the over and under of a band, with the return each stands for', () => {
    const band = { color: '#333', band: { lo: [0, 5, 8], hi: [0, 15, 40] } }
    const tags = buildTags(2, lines, [band], [], scaleY, spec)
    expect(tags.filter((t) => t.band).map((t) => t.text)).toEqual(['9% · 40', '3% · 8'])
  })

  it('merges lines that read the same figure into one tag with a colour for each, level with their mean', () => {
    const same = [
      { id: 'a', color: '#111', values: [24] },
      { id: 'b', color: '#222', values: [24] },
      { id: 'c', color: '#333', values: [24] },
      { id: 'd', color: '#444', values: [30] },
    ]
    const tags = buildTags(0, same, [], [], (v: number) => 100 - v, spec)
    expect(tags).toHaveLength(2)
    expect(tags[0]).toMatchObject({ text: '24', colors: ['#111', '#222', '#333'], y: 76 })
    expect(tags[1]).toMatchObject({ text: '30', colors: ['#444'] })
  })

  it('does not merge figures that differ in the last place they are written to, or a band edge with a line', () => {
    const near = [
      { id: 'a', color: '#111', values: [24] },
      { id: 'b', color: '#222', values: [25] },
    ]
    expect(buildTags(0, near, [], [], scaleY, spec)).toHaveLength(2)
    const band = { color: '#333', band: { lo: [24], hi: [24] } }
    const sameAsBand = [{ id: 'a', color: '#111', values: [24] }]
    expect(
      buildTags(0, sameAsBand, [band], [], scaleY, { ...spec, format: () => '24', bandLabels: { lo: '', hi: '' } }),
    ).toHaveLength(3)
  })

  it('tags a dotted line read off its segment, with a chip of its own that is never merged with a line', () => {
    const today = {
      id: 'from-today',
      color: '#111',
      points: [
        { xIndex: 1, value: 20 },
        { xIndex: 3, value: 40 },
      ],
    }
    const tags = buildTags(2, [{ id: 'a', color: '#111', values: [0, 0, 30] }], [], [today], scaleY, spec)
    // The plan's own line reads 30 and so does the dotted one at year 2: two chips, not one with two dots.
    expect(tags.map((t) => [t.id, t.text, t.dotted, t.colors.length])).toEqual([
      ['a', '30', false, 1],
      ['from-today', '30', true, 1],
    ])
    expect(tags[1]!.y).toBe(170)
  })

  it('has no chip for a dotted line before it starts, or after it ends', () => {
    const today = {
      id: 'from-today',
      color: '#111',
      points: [
        { xIndex: 2, value: 20 },
        { xIndex: 3, value: 40 },
      ],
    }
    expect(buildTags(1, [], [], [today], scaleY, spec)).toEqual([])
    expect(buildTags(4, [], [], [today], scaleY, spec)).toEqual([])
  })

  it('has no band chips without labels for them, or where the band has no value in the year', () => {
    const band = { color: '#333', band: { lo: [1], hi: [2] } }
    expect(
      buildTags(0, lines, [band], [], scaleY, { format: spec.format, textOn: spec.textOn }).some((t) => t.band),
    ).toBe(false)
    expect(buildTags(2, lines, [band], [], scaleY, spec).some((t) => t.band)).toBe(false)
    expect(buildTags(0, lines, [{ color: '#333' }], [], scaleY, spec).some((t) => t.band)).toBe(false)
  })
})
