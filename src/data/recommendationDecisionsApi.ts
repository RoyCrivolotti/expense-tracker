import { req } from './apiClient'
import { path } from './recommendationsApi'

// Kept apart from `recommendationsApi`, which the app loads at once: only the review card makes these two calls.

export async function dismissRecommendation(id: string): Promise<void> {
  await req<{ ok: true }>(path(id, 'dismiss'), { method: 'POST' })
}

/** The person already typed this payment: point the recommendation at that row and create nothing. */
export async function linkRecommendation(id: string, transactionId: number): Promise<void> {
  await req<{ ok: true }>(path(id, 'link'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ transactionId }),
  })
}
