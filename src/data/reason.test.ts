import { describe, expect, it } from 'vitest'
import { reason } from './reason'

describe('reason', () => {
  it('is the message of an error', () => {
    expect(reason(new Error('the list could not be read'))).toBe('the list could not be read')
  })

  it('is the text of anything else that was thrown', () => {
    expect(reason('offline')).toBe('offline')
    expect(reason(503)).toBe('503')
    expect(reason(undefined)).toBe('undefined')
  })
})
