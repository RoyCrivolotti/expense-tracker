/**
 * A phone sending bank pushes through the real capture Worker into the database a test's routes read, so a test can
 * follow a push from arrival to decision. Each push is a minute after the last on 3 November 2026, so none is taken for
 * a replay, and `now` must be within the Worker's week of that.
 */
import { createD1AccessRepository } from '../adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../adapters/d1CaptureRepository'
import { createCaptureKey } from '../../../src/domain/application/captureKeyService'
import { handleCapture } from '../../../workers/capture/src/handle'

export interface CapturePhone {
  /** Sends one push and answers the id of the recommendation it made, or null when it made none. */
  push(body: string): Promise<string | null>
}

export async function capturePhone(
  db: D1Database,
  owner: string,
  now: Date,
): Promise<CapturePhone> {
  const env = { DB: db, OWNER_EMAIL: owner, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  const captures = createD1CaptureRepository(env)
  const created = await createCaptureKey(captures, owner, 'Phone', now)
  if (!created) throw new Error('the owner already holds the most capture keys')
  let minute = 0
  return {
    push: async (body) => {
      minute += 1
      const date = `2026-11-03T09:${String(minute).padStart(2, '0')}:00+01:00`
      const request = new Request('https://capture.example.test/capture', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${created.key}` },
        body: JSON.stringify({ source: 'iberia', title: 'Compra realizada', body, date }),
      })
      const response = await handleCapture(request, env, {
        captures,
        access: createD1AccessRepository(env),
        now: () => now,
        log: () => undefined,
      })
      if (response.status !== 200) throw new Error(`the capture Worker answered ${response.status}`)
      const row = await db
        .prepare('SELECT id FROM recommendations WHERE owner = ?1 AND occurred_at = ?2')
        .bind(owner, date)
        .first<{ id: string }>()
      return row?.id ?? null
    },
  }
}
