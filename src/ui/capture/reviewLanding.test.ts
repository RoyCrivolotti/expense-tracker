import { describe, expect, it } from 'vitest'
import { pendingReviewId, withoutReview } from './reviewLanding'

describe('the payment a notification was tapped for', () => {
  it('is the review parameter of the URL the tap opened, or none', () => {
    expect(pendingReviewId('?review=abc-1')).toBe('abc-1')
    expect(pendingReviewId('?ledger=off&review=abc-1')).toBe('abc-1')
    expect(pendingReviewId('')).toBeNull()
    expect(pendingReviewId('?other=1')).toBeNull()
  })

  it('comes off the URL and leaves the rest as it was', () => {
    expect(withoutReview(new URL('https://app.example/?review=abc-1'))).toBe('/')
    expect(withoutReview(new URL('https://app.example/?ledger=off&review=abc-1#top'))).toBe('/?ledger=off#top')
  })
})
