/**
 * Deals test files between CI's test shards by how long each took on GitHub, so the four shards
 * finish close together. Vitest's own `--shard` cuts the sorted list of file hashes into equal
 * counts, and a few files take a minute where most take a second, so one shard ran a minute and
 * a half longer than another.
 *
 * Weights come from scripts/test-durations.json (seconds per file, refreshed by
 * scripts/refresh-test-durations.mjs; see docs/TESTING.md). A file the list does not know, new or
 * renamed, weighs the median and still runs: the weights only decide which shard a file goes to,
 * never whether it runs. Without `--shard` this class is not asked to shard, so a local run is
 * unchanged.
 */
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { BaseSequencer } from 'vitest/node'
import { pickShard } from './shardUnits.mjs'

const DURATIONS_FILE = join(import.meta.dirname, 'test-durations.json')

/** @returns {Record<string, number>} */
export function readDurations(file = DURATIONS_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * The files shard `index` of `count` runs, in the order given.
 * @template T
 * @param {T[]} files
 * @param {(file: T) => string} pathOf the file's path from the repository root, as the durations list writes it
 * @param {Record<string, number>} durations
 * @param {{ index: number, count: number }} shard
 * @returns {T[]}
 */
export function shardByDuration(
  files,
  pathOf,
  durations,
  shard,
) {
  const known = Object.values(durations).sort((a, b) => a - b)
  const median = known.length > 0 ? known[Math.floor(known.length / 2)] : 1
  // Sorted by path first, so every shard job deals the same hand whatever order the files were
  // found in.
  const units = files
    .map((file) => ({ file, path: pathOf(file) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ file, path }) => ({ file, weight: durations[path] ?? median }))
  return pickShard(units, shard).map((unit) => unit.file)
}

export default class DurationSequencer extends BaseSequencer {
  /** @param {import('vitest/node').TestSpecification[]} files */
  async shard(files) {
    const root = this.ctx.config.root
    return shardByDuration(
      files,
      (spec) => relative(root, spec.moduleId).split('\\').join('/'),
      readDurations(),
      this.ctx.config.shard,
    )
  }
}
