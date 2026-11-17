import { describe, expect, it } from 'vitest'
import { ratesOf } from './captureDiagnostics'

const none = { received: 0, recommended: 0, grouped: 0, unread: 0, addedAsIs: 0, edited: 0, linked: 0, dismissed: 0, open: 0, muted: 0 }

describe('ratesOf', () => {
  it('gives each rate as a whole percentage of the decided recommendations, links counted as decided', () => {
    expect(ratesOf({ ...none, addedAsIs: 5, edited: 2, linked: 1, dismissed: 1, open: 4 })).toEqual({ decided: 9, addedAsIs: 56, edited: 22, dismissed: 11 })
  })

  it('is null before anything was decided, however many are waiting', () => {
    expect(ratesOf({ ...none, received: 3, recommended: 3, open: 3 })).toBeNull()
  })
})
