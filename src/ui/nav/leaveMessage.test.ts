import { describe, expect, it } from 'vitest'
import { leaveMessage } from './leaveMessage'

const base = { name: 'Path A', detached: false, canSave: true, saving: false }

describe('leaveMessage', () => {
  it('names the scenario and says to save first', () => {
    expect(leaveMessage(base)).toBe(
      'Your changes to Path A will be lost if you leave. Stay and save first to keep them.',
    )
  })

  it('says to save a draft as a new scenario, since no saved scenario holds it', () => {
    expect(leaveMessage({ ...base, detached: true })).toBe(
      'The unsaved draft will be lost if you leave. Stay and save it as a new scenario first to keep it.',
    )
  })

  it('does not offer a save in a read-only session, where there is none', () => {
    expect(leaveMessage({ ...base, canSave: false })).toBe(
      "Your changes to Path A will be lost if you leave. This session is read-only, so they can't be saved.",
    )
    expect(leaveMessage({ ...base, canSave: false, detached: true })).toBe(
      "The unsaved draft will be lost if you leave. This session is read-only, so it can't be saved.",
    )
  })
})
