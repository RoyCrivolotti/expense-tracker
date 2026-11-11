import { describe, expect, it } from 'vitest'
import { replayKey } from './replayKey'
import type { RawPush } from './types'

const push: RawPush = { source: 'iberia', title: 'Title', body: 'Body', date: '2026-11-03T09:41:07+01:00' }

describe('replayKey', () => {
  it('is the same for the same push posted twice', () => {
    expect(replayKey({ ...push })).toBe(replayKey(push))
  })

  it.each([
    ['source', { source: 'santander' as const }],
    ['title', { title: 'Other' }],
    ['body', { body: 'Other' }],
    ['date', { date: '2026-11-03T09:41:08+01:00' }],
  ])('changes when only the %s changes', (_field, change) => {
    expect(replayKey({ ...push, ...change })).not.toBe(replayKey(push))
  })

  it('cannot be forged by moving text across a field boundary', () => {
    const a = replayKey({ ...push, title: 'a|1:b', body: 'c' })
    const b = replayKey({ ...push, title: 'a', body: 'b|1:c' })
    expect(a).not.toBe(b)
  })
})
