import { describe, expect, it } from 'vitest'
import { noStatusMessage } from './trackMessages'

describe('noStatusMessage', () => {
  it('tells someone with no plan where a plan is made, with the words of the screens they will find it on', () => {
    expect(noStatusMessage(null, '2026-06-01')).toBe(
      'No plan chosen yet. Save a scenario on the Plan page (Scenarios on a phone) and choose Use as my plan.',
    )
  })
})
