import { isoWithOffset, replayKey } from '../../../src/domain/capture'
import type { Interpretation, RawPush } from '../../../src/domain/capture'
import type {
  CaptureCaps,
  CaptureEvent,
  CaptureKey,
  CaptureRepository,
  NewRecommendation,
} from '../../../src/domain/ports/captureRepository'
import { hmacHex } from './hmac'

type Recommended = Extract<Interpretation, { outcome: 'recommend' }>

const MAX_MERCHANT = 200
const MAX_EXCERPT = 500
const CURRENCY = 'EUR'

export type StoreResult = 'stored' | 'replay' | 'limited'

/**
 * Stores a recognised push and the recommendation it becomes, in one batch. The text kept is the cleaned body
 * and only for kinds whose body names nobody (`rawText` is absent for the rest). A body is kept as an excerpt
 * only when no amount could be read, so the person can see what to fix.
 */
export async function storeRecognised(
  captures: CaptureRepository,
  key: CaptureKey,
  push: RawPush,
  result: Recommended,
  secret: string,
  now: Date,
  caps: CaptureCaps,
): Promise<StoreResult> {
  const receivedAt = now.toISOString()
  const hash = await hmacHex(secret, await replayKey(push))
  const text = result.rawText ?? null
  const incomplete = result.amountCents === null
  const cards = result.lastFour ? await captures.listCards(key.owner) : []
  const card = cards.find((c) => c.source === push.source && c.digitsKind === 'card' && c.digits === result.lastFour)
  const occurredAt = new Date(result.instantMs).toISOString()
  const event: CaptureEvent = {
    id: crypto.randomUUID(),
    keyId: key.keyId,
    source: push.source,
    replayKey: hash,
    kind: result.kind,
    amountCents: result.signedCents,
    currency: incomplete ? null : CURRENCY,
    merchantRaw: text === null ? null : text.slice(0, MAX_MERCHANT),
    last4: result.lastFour,
    accountDigits: null,
    occurredAt,
    localDate: result.localDate,
    offsetMinutes: result.offsetMinutes,
    receivedAt,
    bodyExcerpt: incomplete && text !== null ? text.slice(0, MAX_EXCERPT) : null,
  }
  const recommendation: Omit<NewRecommendation, 'owner'> = {
    id: crypto.randomUUID(),
    accountId: card?.accountId ?? null,
    amountCents: result.amountCents,
    currency: event.currency,
    // The recommendation keeps the phone's own clock, so the app can tell the time of day the payment was made.
    occurredAt: isoWithOffset(result.instantMs, result.offsetMinutes),
    localDate: result.localDate,
    merchantRaw: event.merchantRaw,
    descriptionSuggested: null,
    suggestedType: result.suggestedType,
    createdAt: receivedAt,
  }
  if (await captures.recordCapture(event, recommendation, caps)) return 'stored'
  return (await captures.hasEvent(key.keyId, push.source, hash)) ? 'replay' : 'limited'
}
