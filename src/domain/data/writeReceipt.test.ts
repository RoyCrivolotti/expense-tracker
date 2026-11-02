import { describe, expect, it } from 'vitest'
import { REVISION_AFTER_HEADER, REVISION_BEFORE_HEADER, readWriteReceipt } from './writeReceipt'

const headers = (init: Record<string, string>) => new Headers(init)

describe('readWriteReceipt', () => {
  it('reads both tokens', () => {
    expect(readWriteReceipt(headers({ [REVISION_BEFORE_HEADER]: 'aa', [REVISION_AFTER_HEADER]: 'bb' }))).toEqual({ before: 'aa', after: 'bb' })
  })

  it('reads the one that is there, and leaves the other null', () => {
    expect(readWriteReceipt(headers({ [REVISION_BEFORE_HEADER]: 'aa' }))).toEqual({ before: 'aa', after: null })
    expect(readWriteReceipt(headers({ [REVISION_AFTER_HEADER]: 'bb' }))).toEqual({ before: null, after: 'bb' })
  })

  it('is null for a response that is not the answer to a write', () => {
    expect(readWriteReceipt(headers({ etag: 'W/"x"' }))).toBeNull()
  })

  it('reads the names whatever the case a proxy sent them in', () => {
    expect(readWriteReceipt(headers({ 'X-Revision-Before': 'aa' }))).toEqual({ before: 'aa', after: null })
  })
})
