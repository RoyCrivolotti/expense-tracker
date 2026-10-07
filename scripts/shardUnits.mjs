/**
 * Splits the sections of scripts/verify-goals-desktop.mjs between CI jobs, so one long serial
 * run becomes several shorter ones side by side.
 *
 * A section here is `{ name, weight }`, `weight` being roughly the seconds it takes. Weights
 * only balance the shards: a wrong one makes a shard slower, and every section still lands in
 * exactly one shard.
 */

/**
 * '2/4' is the second of four shards. No spec means no sharding.
 * @param {string | undefined} spec
 * @returns {{ index: number, count: number } | null}
 */
export function parseShard(spec) {
  if (spec === undefined || spec === '') return null
  const match = /^(\d+)\/(\d+)$/.exec(spec)
  const index = match ? Number(match[1]) : 0
  const count = match ? Number(match[2]) : 0
  if (index < 1 || index > count) {
    throw new Error(`SHARD must look like 2/4, the second of four; got "${spec}".`)
  }
  return { index, count }
}

/**
 * The sections shard `index` of `count` owns, in their original order. Heaviest first, each goes
 * to whichever shard has the least so far, which keeps the longest shard close to the average.
 * @template {{ weight: number }} T
 * @param {T[]} sections
 * @param {{ index: number, count: number }} shard
 * @returns {T[]}
 */
export function pickShard(sections, { index, count }) {
  const load = Array.from({ length: count }, () => 0)
  /** @type {Map<T, number>} */
  const owner = new Map()
  const heaviestFirst = sections
    .map((section, position) => ({ section, position }))
    .sort((a, b) => b.section.weight - a.section.weight || a.position - b.position)
  for (const { section } of heaviestFirst) {
    const lightest = load.indexOf(Math.min(...load))
    load[lightest] += section.weight
    owner.set(section, lightest + 1)
  }
  return sections.filter((section) => owner.get(section) === index)
}
