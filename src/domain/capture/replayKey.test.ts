import { describe, expect, it } from 'vitest'
import { replayKey } from './replayKey'
import type { RawPush } from './types'

const push: RawPush = { source: 'iberia', title: 'Title', body: 'Body', date: '2026-11-03T09:41:07+01:00' }

describe('replayKey', () => {
  it('is the same for the same push posted twice', async () => {
    expect(await replayKey({ ...push })).toBe(await replayKey(push))
  })

  it.each([
    ['source', { source: 'santander' as const }],
    ['title', { title: 'Other' }],
    ['body', { body: 'Other' }],
    ['date', { date: '2026-11-03T09:41:08+01:00' }],
  ])('changes when only the %s changes', async (_field, change) => {
    expect(await replayKey({ ...push, ...change })).not.toBe(await replayKey(push))
  })

  it('cannot be forged by moving text across a field boundary', async () => {
    const a = await replayKey({ ...push, title: 'a|b', body: 'c' })
    const b = await replayKey({ ...push, title: 'a', body: 'b|c' })
    expect(a).not.toBe(b)
  })

  it('is a SHA-256 hex digest that holds none of the text', async () => {
    const key = await replayKey({ ...push, title: 'Secret code 481516' })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})
