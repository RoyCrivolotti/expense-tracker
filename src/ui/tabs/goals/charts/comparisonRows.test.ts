import { describe, expect, it } from 'vitest'
import { EU_MONEY_FORMAT } from '../../../../engine'
import { makeScenario } from '../../../../testing/factories'
import { scenarioToDraft } from '../scenarioDraft'
import { comparisonRows } from './comparisonRows'

describe('comparisonRows names', () => {
  const original = makeScenario({ id: 1, name: 'Path A: Invest only' })
  const copy = makeScenario({ id: 2, name: 'Path A: Invest only (copy)' })
  const other = makeScenario({ id: 3, name: 'Path B: House now' })
  const draft = scenarioToDraft(original)

  it('cuts a name at its colon when nobody else would be given the same one', () => {
    const rows = comparisonRows([original, other], draft, EU_MONEY_FORMAT, 0.02, false)

    expect(rows.map((r) => r.name)).toEqual(['Path A', 'Path B'])
  })

  it('keeps the full name of a copy and its original, which would both be Path A', () => {
    const rows = comparisonRows([original, copy, other], draft, EU_MONEY_FORMAT, 0.02, true)

    expect(rows.map((r) => r.name)).toEqual([
      'Path A: Invest only',
      'Path A: Invest only (copy)',
      'Path B',
      'Path A: Invest only (editing)',
    ])
  })
})
