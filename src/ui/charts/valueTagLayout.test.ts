import { describe, expect, it } from 'vitest'
import { placeTags, spreadTags, tagWidth, TAG_OFFSET, TAG_PITCH } from './valueTagLayout'

describe('spreadTags', () => {
  it('leaves tags that already clear each other where their lines are', () => {
    expect(spreadTags([40, 100, 160], TAG_PITCH, 0, 230)).toEqual([40, 100, 160])
  })

  it('moves tags that overlap apart as a block centred on where they were asked for', () => {
    const [a, b, c] = spreadTags([70, 74, 78], TAG_PITCH, 0, 230) as [number, number, number]
    expect(b - a).toBe(TAG_PITCH)
    expect(c - b).toBe(TAG_PITCH)
    // Centred on the mean of what was asked for (74), not pushed down from the first.
    expect((a + c) / 2).toBeCloseTo(74)
  })

  it('keeps the order of the lines, whatever order they are given in', () => {
    const out = spreadTags([78, 70, 74], TAG_PITCH, 0, 230)
    expect(out[1]!).toBeLessThan(out[2]!)
    expect(out[2]!).toBeLessThan(out[0]!)
  })

  it('merges blocks that run into each other once they have been spread', () => {
    const out = spreadTags([60, 75, 90, 100], TAG_PITCH, 0, 230)
    const sorted = [...out].sort((x, y) => x - y)
    sorted.forEach((y, i) => i > 0 && expect(y - sorted[i - 1]!).toBeGreaterThanOrEqual(TAG_PITCH - 0.001))
  })

  it('keeps a block inside the plot at either end', () => {
    expect(spreadTags([2, 4], TAG_PITCH, 9, 230)).toEqual([9, 9 + TAG_PITCH])
    const [a, b] = spreadTags([226, 228], TAG_PITCH, 9, 221) as [number, number]
    expect(b).toBe(221)
    expect(a).toBe(221 - TAG_PITCH)
  })
})

describe('placeTags', () => {
  const tags = [
    { id: 'a', color: '#111', colors: ['#111'], y: 50, text: '2,26M €', band: false, dotted: false },
    { id: 'b', color: '#222', colors: ['#222'], y: 120, text: '1,31M €', band: false, dotted: false },
  ]

  it('puts the tags beside the dots on the right', () => {
    const placed = placeTags(tags, 300, 640, 16, 200)
    expect(placed.every((p) => p.x === 300 + TAG_OFFSET)).toBe(true)
  })

  it('puts them on the left where the right has no room, so they end at the same distance from the dots', () => {
    const placed = placeTags(tags, 620, 640, 16, 200)
    placed.forEach((p) => expect(p.x + p.width).toBe(620 - TAG_OFFSET))
  })

  it('makes a tag as wide as its text needs, and no narrower than a short one', () => {
    expect(tagWidth('1M')).toBe(tagWidth('1,2M'))
    // A merged tag has room for a dot of each colour as well.
    expect(tagWidth('2,24M €', 3)).toBeGreaterThan(tagWidth('2,24M €'))
    expect(tagWidth('9,0% · 2,94M €')).toBeGreaterThan(tagWidth('2,26M €'))
  })
})
