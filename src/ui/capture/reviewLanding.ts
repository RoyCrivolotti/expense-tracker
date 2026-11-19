/**
 * The payment a notification was tapped for. The service worker opens the app at `/?review=<id>`, and the card, which
 * mounts once there is something to review, opens that payment's form and takes the id off the URL, so a reload does
 * not open it again.
 */
export const REVIEW_PARAM = 'review'

export function pendingReviewId(search: string): string | null {
  try {
    return new URLSearchParams(search).get(REVIEW_PARAM)
  } catch {
    return null
  }
}

/** The URL with the id taken off, and nothing else touched. */
export function withoutReview(url: URL): string {
  const next = new URL(url.href)
  next.searchParams.delete(REVIEW_PARAM)
  return next.pathname + next.search + next.hash
}
