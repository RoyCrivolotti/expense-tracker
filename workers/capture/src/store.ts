import { cleanText, isoWithOffset, readPush, replayKey, shapeId, spanText } from '../../../src/domain/capture'
import type { Interpretation, RawPush, Slot } from '../../../src/domain/capture'
import type {
  CaptureCaps,
  CaptureEvent,
  CaptureKey,
  CaptureRepository,
  NewRecommendation,
  TemplateDecision,
} from '../../../src/domain/ports/captureRepository'
import { hmacHex } from './hmac'
import { decideTemplate, mutes } from './templates'

type Recommended = Extract<Interpretation, { outcome: 'recommend' }>

const MAX_MERCHANT = 200
const MAX_BODY = 500
const MAX_SLOTS_JSON = 2000
const CURRENCY = 'EUR'

/** `ignored`: the push belongs to a template the person has ignored, so it was counted and not stored. */
export type StoreResult = 'stored' | 'replay' | 'limited' | 'ignored'

/**
 * The slots as JSON, keeping the longest run from the start that fits the column. Each slot is written once and the
 * lengths added up, so a body full of numbers costs one pass rather than one stringify per slot dropped.
 */
export function slotsJson(slots: readonly Slot[]): string {
  const parts: string[] = []
  let length = 2
  for (const slot of slots) {
    const part = JSON.stringify(slot)
    const next = length + part.length + (parts.length > 0 ? 1 : 0)
    if (next > MAX_SLOTS_JSON) break
    parts.push(part)
    length = next
  }
  return `[${parts.join(',')}]`
}

interface Reading {
  decision: TemplateDecision
  /** The template the push joins when that template mutes it (`mutes`), else null. */
  ignoredTemplate: string | null
  shapeId: string
  slots: string
  merchantRaw: string | null
  body: string | null
}

/**
 * What the push's words give: its template, its shape and slots, the description and the body to keep. The
 * description is the merchant when the template knows where it sits, otherwise the whole cleaned body (`rawText`,
 * absent for kinds whose body names a person), which the person edits once. No text of a push is kept, as body or
 * description, unless it shows an amount with a currency marker, so a one-time code never lands.
 */
async function readForStore(captures: CaptureRepository, owner: string, push: RawPush, rawText: string | undefined): Promise<Reading> {
  const body = cleanText(push.body)
  const reading = readPush(push.title, body)
  const templates = reading.currencyAmount === null ? [] : await captures.findTemplates(owner, push.source, reading.titleSkeleton)
  const { decision, merchant } = decideTemplate(templates, reading, () => crypto.randomUUID())
  const joined = decision.kind === 'existing' ? templates.find((t) => t.templateId === decision.templateId) : undefined
  const keepsText = reading.currencyAmount !== null && rawText !== undefined
  const text = keepsText ? (merchant ? spanText(reading, merchant) : '') || rawText : ''
  return {
    decision,
    ignoredTemplate: joined && mutes(joined, reading.skeleton) ? joined.templateId : null,
    shapeId: await shapeId(push.source, reading.skeleton),
    slots: slotsJson(reading.slots),
    merchantRaw: text ? text.slice(0, MAX_MERCHANT) : null,
    body: reading.currencyAmount !== null && body !== '' ? body.slice(0, MAX_BODY) : null,
  }
}

/**
 * Stores a recognised push and the recommendation it becomes, in one batch, with its shape, its slots and the
 * template it belongs to. A push of a template the person has ignored is only counted, as an unread push of the day
 * and a sighting of the template, so the setup screen's counts stay true. A push that makes a new template is never
 * ignored.
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
  const read = await readForStore(captures, key.owner, push, result.rawText)
  if (read.ignoredTemplate !== null) {
    await captures.countIgnoredPush(key.owner, push.source, receivedAt.slice(0, 10), read.ignoredTemplate, receivedAt)
    return 'ignored'
  }
  const hash = await hmacHex(secret, await replayKey(push))
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
    merchantRaw: read.merchantRaw,
    last4: result.lastFour,
    accountDigits: null,
    occurredAt,
    localDate: result.localDate,
    offsetMinutes: result.offsetMinutes,
    receivedAt,
    shapeId: read.shapeId,
    slots: read.slots,
    body: read.body,
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
  if (await captures.recordCapture(event, recommendation, caps, read.decision)) return 'stored'
  return (await captures.hasEvent(key.keyId, push.source, hash)) ? 'replay' : 'limited'
}
