import { describe, expect, it } from 'vitest'
import { parseShard, pickShard } from './shardUnits.mjs'

const sections = [
  { name: 'a', weight: 40 },
  { name: 'b', weight: 30 },
  { name: 'c', weight: 20 },
  { name: 'd', weight: 20 },
  { name: 'e', weight: 10 },
  { name: 'f', weight: 10 },
  { name: 'g', weight: 5 },
]

describe('parseShard', () => {
  it('means no sharding when there is no spec', () => {
    expect(parseShard(undefined)).toBeNull()
    expect(parseShard('')).toBeNull()
  })

  it('reads the second of four', () => {
    expect(parseShard('2/4')).toEqual({ index: 2, count: 4 })
  })

  it.each(['0/4', '5/4', '2', '2/', 'a/b', '1/0', '-1/4'])('rejects "%s"', (spec) => {
    expect(() => parseShard(spec)).toThrow(/SHARD must look like/)
  })
})

describe('pickShard', () => {
  it.each([1, 2, 3, 4, 7])('puts every section in exactly one of %i shards', (count) => {
    const shards = Array.from({ length: count }, (_, i) => pickShard(sections, { index: i + 1, count }))
    const names = shards.flat().map((s) => s.name)
    expect(names.sort()).toEqual(sections.map((s) => s.name).sort())
  })

  it('keeps the original order inside a shard', () => {
    const shard = pickShard(sections, { index: 1, count: 2 })
    const positions = shard.map((s) => sections.indexOf(s))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('gives the same answer every time', () => {
    expect(pickShard(sections, { index: 2, count: 3 })).toEqual(pickShard(sections, { index: 2, count: 3 }))
  })

  it('keeps the heaviest shard close to the average', () => {
    const loads = [1, 2, 3].map((index) =>
      pickShard(sections, { index, count: 3 }).reduce((sum, s) => sum + s.weight, 0),
    )
    const total = sections.reduce((sum, s) => sum + s.weight, 0)
    expect(Math.max(...loads)).toBeLessThanOrEqual(total / 3 + 20)
  })

  it('leaves a shard empty when there are fewer sections than shards', () => {
    expect(pickShard(sections.slice(0, 2), { index: 3, count: 3 })).toEqual([])
  })
})
