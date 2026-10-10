import { describe, expect, it } from 'vitest'
import { referenceLines } from './referenceLines'

const years = [0, 1, 2, 3, 4, 5]
const milestones = [
  { amountCents: 10_000_000, label: '' },
  { amountCents: 20_000_000, label: '' },
]
const base = { milestones, fiTargetCents: null, drawnMax: 30_000_000, years, inflationRate: 0.02 }

describe('referenceLines in Purchasing power', () => {
  it('draws a milestone, which is an amount on the account, as a curve that falls by the inflation, in the money of the plan start', () => {
    const { curves, lines } = referenceLines({ ...base, nominalMode: false })
    expect(lines).toEqual([])
    expect(curves).toHaveLength(2)
    expect(curves[0]!.values).toEqual(years.map((y) => Math.round(10_000_000 / 1.02 ** y)))
    expect(curves[0]!.values[0]).toBe(10_000_000)
    expect(curves[1]!.values[5]).toBe(Math.round(20_000_000 / 1.02 ** 5))
  })

  it('draws the FI target, which is already in the plan’s money, as a flat line', () => {
    const { lines, curves } = referenceLines({ ...base, fiTargetCents: 25_000_000, nominalMode: false })
    expect(lines).toEqual([25_000_000])
    expect(curves).toHaveLength(2)
  })

  it('leaves out a milestone whose curve ends far above the plan, and marks an FI target above the chart instead of drawing it', () => {
    const far = { ...base, milestones: [...milestones, { amountCents: 900_000_000, label: '' }], fiTargetCents: 900_000_000 }
    const result = referenceLines({ ...far, nominalMode: false })
    expect(result.curves).toHaveLength(2)
    expect(result.lines).toEqual([])
    expect(result.fiAbove).toBe(900_000_000)
  })

  it('keeps a milestone whose curve starts above the plan but comes down to it', () => {
    // 250k on the account is 226k in the plan’s money by year 5: within reach of a plan that tops out at 240k.
    const result = referenceLines({ ...base, milestones: [{ amountCents: 25_000_000, label: '' }], drawnMax: 24_000_000, nominalMode: false })
    expect(result.curves).toHaveLength(1)
  })
})

describe('referenceLines in Nominal', () => {
  it('draws a milestone as a flat line, since it is an amount on the account', () => {
    const { lines } = referenceLines({ ...base, nominalMode: true })
    expect(lines).toEqual([10_000_000, 20_000_000])
  })

  it('draws the FI target, which is in the plan’s money, as a curve that rises with the inflation', () => {
    const { curves } = referenceLines({ ...base, fiTargetCents: 25_000_000, nominalMode: true })
    expect(curves).toHaveLength(1)
    expect(curves[0]!.values).toEqual(years.map((y) => Math.round(25_000_000 * 1.02 ** y)))
  })

  it('leaves out a milestone above the chart, and marks an FI target above it', () => {
    const result = referenceLines({ ...base, milestones: [...milestones, { amountCents: 900_000_000, label: '' }], fiTargetCents: 900_000_000, nominalMode: true })
    expect(result.lines).toEqual([10_000_000, 20_000_000])
    expect(result.curves).toEqual([])
    expect(result.fiAbove).toBe(900_000_000)
  })
})

describe('referenceLines at no inflation', () => {
  it('is flat for every target in both views', () => {
    const real = referenceLines({ ...base, fiTargetCents: 25_000_000, nominalMode: false, inflationRate: 0 })
    expect(real.curves[0]!.values.every((v) => v === 10_000_000)).toBe(true)
    const nominal = referenceLines({ ...base, fiTargetCents: 25_000_000, nominalMode: true, inflationRate: 0 })
    expect(nominal.curves[0]!.values.every((v) => v === 25_000_000)).toBe(true)
  })
})

describe('referenceLines with nothing to go on', () => {
  it('has no ceiling before the chart has a height, and draws everything', () => {
    const result = referenceLines({ ...base, drawnMax: undefined, nominalMode: true })
    expect(result.lines).toEqual([10_000_000, 20_000_000])
  })

  it('draws nothing for no milestones and no target', () => {
    expect(referenceLines({ ...base, milestones: [], nominalMode: false })).toEqual({ lines: [], curves: [], fiAbove: null })
  })
})
