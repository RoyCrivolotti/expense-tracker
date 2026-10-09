/**
 * A seeded source of standard normal numbers, so that a replay of the market is the same picture every time
 * it is asked for and an edit moves it smoothly instead of redrawing it.
 */

/** A small fast generator of numbers in [0, 1): the same numbers for the same seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Two uniforms in [0, 1) as two independent standard normals. The logarithm takes `1 - u1`, which is in
 * (0, 1], so a uniform of exactly zero (it happens about once in 30.000 draws of 10.000 x 60) is a normal of
 * about 6,7 and not an infinity that turns a whole run into NaN.
 */
export function boxMuller(u1: number, u2: number): [number, number] {
  const r = Math.sqrt(-2 * Math.log(1 - u1))
  const angle = 2 * Math.PI * u2
  return [r * Math.cos(angle), r * Math.sin(angle)]
}

let cached: { key: string; draws: Float64Array } | null = null

/**
 * `pairs` standard normals for each of `years` years, year by year: the draw for pair `k` in year `t` is at
 * `t * pairs + k`. They are made in that order from the seed, so the first years of a longer matrix are those
 * of a shorter one, and the last matrix asked for is kept, since a replay asks for the same one on every edit.
 */
export function normalDraws(pairs: number, years: number, seed: number): Float64Array {
  const key = `${pairs}|${years}|${seed}`
  if (cached?.key === key) return cached.draws
  const total = pairs * years
  const draws = new Float64Array(total)
  const uniform = mulberry32(seed)
  for (let i = 0; i < total; i += 2) {
    const [a, b] = boxMuller(uniform(), uniform())
    draws[i] = a
    if (i + 1 < total) draws[i + 1] = b
  }
  cached = { key, draws }
  return draws
}
