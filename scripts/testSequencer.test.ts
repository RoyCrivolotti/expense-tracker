import { globSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { durationsFromBlobs } from './refresh-test-durations.mjs'
import DurationSequencer, { readDurations, shardByDuration } from './testSequencer.mjs'

const ROOT = join(import.meta.dirname, '..')
const byPath = (path: string) => path

function shards(
  files: string[],
  durations: Record<string, number>,
  count: number,
) {
  return Array.from({ length: count }, (_, i) => shardByDuration(files, byPath, durations, { index: i + 1, count }))
}

describe('shardByDuration', () => {
  const durations = { 'a.test.ts': 60, 'b.test.ts': 30, 'c.test.ts': 20, 'd.test.ts': 20, 'e.test.ts': 5 }

  it.each([1, 2, 3, 4, 6])('runs every file exactly once across %i shards, listed or not', (count) => {
    const files = [...Object.keys(durations), 'new.test.ts', 'renamed.test.ts']
    const dealt = shards(files, durations, count).flat()
    expect(dealt.sort()).toEqual([...files].sort())
  })

  it('ignores a listed file that no longer exists', () => {
    const files = ['b.test.ts', 'c.test.ts']
    expect(shards(files, durations, 2).flat().sort()).toEqual(files)
  })

  it('balances by time, not by count', () => {
    // 65 s and 70 s; cut by count it would be two files against three whatever they weigh.
    expect(shards(Object.keys(durations), durations, 2)).toEqual([
      ['a.test.ts', 'e.test.ts'],
      ['b.test.ts', 'c.test.ts', 'd.test.ts'],
    ])
  })

  it('deals the same hand whatever order the files arrive in', () => {
    const files = Object.keys(durations)
    expect(shards([...files].reverse(), durations, 3)).toEqual(shards(files, durations, 3))
  })

  it('weighs an unlisted file as the median, not as nothing', () => {
    // At a weight of 0 both new files would pile onto the shard without `a`; at the median (20)
    // the second one goes to the other shard.
    const files = ['a.test.ts', 'b.test.ts', 'x.test.ts', 'y.test.ts']
    const [first, second] = shards(files, { 'a.test.ts': 40, 'b.test.ts': 20, 'c.test.ts': 20 }, 2)
    expect(first).toEqual(['a.test.ts', 'y.test.ts'])
    expect(second).toEqual(['b.test.ts', 'x.test.ts'])
  })
})

describe('the recorded durations', () => {
  const durations = readDurations()
  const testFiles = globSync('{src,functions,workers,scripts}/**/*.test.{ts,tsx}', { cwd: ROOT }).map((file) =>
    file.split('\\').join('/'),
  )

  it('give four shards within a few seconds of each other', () => {
    const listed = testFiles.filter((file) => file in durations)
    const loads = shards(listed, durations, 4).map((files) => files.reduce((sum, file) => sum + durations[file], 0))
    const mean = loads.reduce((sum, load) => sum + load, 0) / loads.length
    expect(Math.max(...loads) - mean).toBeLessThan(5)
  })

  it('still run every test file in the repository exactly once', () => {
    expect(testFiles.length).toBeGreaterThan(500)
    expect(shards(testFiles, durations, 4).flat().sort()).toEqual([...testFiles].sort())
  })
})

describe('DurationSequencer', () => {
  it('shards by the file path from the root', async () => {
    const root = '/repo'
    const sequencer = new DurationSequencer({ config: { root, shard: { index: 1, count: 2 } } } as never)
    const spec = (path: string) => ({ moduleId: `${root}/${path}` })
    const specs = Object.keys(readDurations()).slice(0, 10).map(spec)
    const first = await sequencer.shard(specs as never)
    ;(sequencer as unknown as { ctx: { config: { shard: unknown } } }).ctx.config.shard = { index: 2, count: 2 }
    const second = await sequencer.shard(specs as never)
    expect([...first, ...second].map((s) => s.moduleId).sort()).toEqual(specs.map((s) => s.moduleId).sort())
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
  })
})

describe('durationsFromBlobs', () => {
  it('adds up the time a worker spent on each file and keys it by path', () => {
    const file = (
      name: string,
      ms: number,
    ) => ({
      name,
      environmentLoad: ms / 5,
      prepareDuration: ms / 5,
      setupDuration: ms / 5,
      collectDuration: ms / 5,
      result: { duration: ms / 5 },
    })
    const blobs = [
      ['4.1.10', [file('src/b.test.ts', 1500)]],
      ['4.1.10', [file('src/a.test.ts', 250), { name: 'src/c.test.ts' }]],
    ]
    expect(durationsFromBlobs(blobs)).toEqual({ 'src/a.test.ts': 0.3, 'src/b.test.ts': 1.5, 'src/c.test.ts': 0 })
    expect(Object.keys(durationsFromBlobs(blobs))).toEqual(['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts'])
  })
})
