import { describe, expect, it } from 'vitest'
import { matchAnnouncement } from './matchAnnouncement'

describe('matchAnnouncement', () => {
  it('says how many match, and that it is that many or more when the count stopped', () => {
    expect(matchAnnouncement({ count: 12, capped: false, failed: undefined })).toBe('12 transactions match')
    expect(matchAnnouncement({ count: 1000, capped: true, failed: undefined })).toBe('1000+ transactions match')
  })

  it('says nothing while the count is not known', () => {
    expect(matchAnnouncement({ count: null, capped: true, failed: undefined })).toBe('')
  })

  it('says nothing when the list could not be read, whatever figures are left from before', () => {
    expect(matchAnnouncement({ count: 40, capped: false, failed: 'the list could not be read' })).toBe('')
  })
})
