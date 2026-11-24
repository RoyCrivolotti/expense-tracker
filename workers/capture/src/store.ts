import {
  cleanText,
  isoWithOffset,
  messageDate,
  readPush,
  replayKey,
  shapeId,
  spanText,
} from '../../../src/domain/capture'
import type { PushInstant } from '../../../src/domain/capture'
import type { PushReading, RawPush, Slot } from '../../../src/domain/capture'
import type { CaptureCaps, CaptureEvent, CaptureRecorded } from '../../../src/domain/ports/captureEvents'
import type { CaptureKey } from '../../../src/domain/ports/captureKeys'
import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import type { NewRecommendation } from '../../../src/domain/ports/captureRecommendations'
import type { TemplateDecision } from '../../../src/domain/ports/captureTemplates'
import { hmacHex } from './hmac'
import type { CreatedPayment } from './notify'
import { decideTemplate, mutes } from './templates'

const MAX_MERCHANT = 200
const MAX_BODY = 500
const MAX_SLOTS_JSON = 2000

/**
 * What became of a push. `grouped`: it was stored as another push of an open recommendation of the same movement
 * (`sameMovement`), which it joined instead of making a second. `ignored`: it belongs to a template the person has ignored, so it was counted and not
 * stored. `no-amount` and `code-like`: it shows no amount with a currency marker, so nothing of it is stored and the
 * caller counts it as unread; `code-like` when all it holds is a code.
 */
export type StoreResult = 'stored' | 'grouped' | 'replay' | 'limited' | 'ignored' | 'no-amount' | 'code-like'

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

/** The amount a push makes a recommendation of: the first reading of its one currency-marked number, or null. */
function amountOf(reading: PushReading): { cents: number; currency: string } | null {
  const slot = reading.currencyAmount
  const cents = slot?.candidates[0]?.cents
  return slot?.currency && cents !== undefined ? { cents, currency: slot.currency } : null
}

/** A push with no amount that holds a code and no other number: what a one-time code looks like, whatever its words. */
function codeLike(slots: readonly Slot[]): boolean {
  return slots.some((s) => s.kind === 'code') && !slots.some((s) => s.kind === 'number')
}

/** The card's last four digits when the push names exactly one, in the title or the body. */
function lastFourOf(slots: readonly Slot[]): string | null {
  const digits = new Set(slots.flatMap((s) => (s.kind === 'masked-digits' ? [s.digits] : [])))
  return digits.size === 1 ? ([...digits][0] ?? null) : null
}

interface Reading {
  decision: TemplateDecision
  /** The template the push joins when that template mutes it (`mutes`), else null. */
  ignoredTemplate: string | null
  shapeId: string
  slots: string
  merchantRaw: string | null
  /** Whether `merchantRaw` is the merchant the template found rather than the whole body. */
  merchantIsSpan: boolean
  body: string | null
}

/**
 * What the words of a push with an amount give: its template, its shape and slots, the description and the body to
 * keep. The description is the merchant when the template knows where it sits, otherwise the whole cleaned body,
 * which the person edits once, and none when the body is empty (the amount was in the title).
 */
async function readForStore(
  captures: CaptureRepository,
  owner: string,
  push: RawPush,
  body: string,
  reading: PushReading,
): Promise<Reading> {
  const templates = await captures.findTemplates(owner, push.source, reading.titleSkeleton)
  const { decision, merchant } = decideTemplate(templates, reading, () => crypto.randomUUID())
  const joined = decision.kind === 'existing' ? templates.find((t) => t.templateId === decision.templateId) : undefined
  const span = merchant ? spanText(reading, merchant) : ''
  const text = span || body
  return {
    decision,
    ignoredTemplate: joined && mutes(joined, reading.skeleton) ? joined.templateId : null,
    shapeId: await shapeId(push.source, reading.skeleton),
    slots: slotsJson(reading.slots),
    merchantRaw: text === '' ? null : text.slice(0, MAX_MERCHANT),
    merchantIsSpan: span !== '',
    body: body === '' ? null : body.slice(0, MAX_BODY),
  }
}

/**
 * The recommendation a stored push becomes: an expense of its amount, on the card's account when the card is linked,
 * dated by the date its words name (`messageDate`) or else the day it arrived.
 */
function newRecommendation(
  amount: { cents: number; currency: string },
  date: PushInstant,
  paidOn: string,
  read: Reading,
  accountId: number | null,
  receivedAt: string,
): Omit<NewRecommendation, 'owner'> {
  return {
    id: crypto.randomUUID(),
    accountId,
    amountCents: amount.cents,
    currency: amount.currency,
    // The recommendation keeps the phone's own clock, so the app can tell the time of day the payment was made.
    // It stays the arrival when the words name another day, so the app can tell the date came from the message.
    occurredAt: isoWithOffset(date.instantMs, date.offsetMinutes),
    localDate: paidOn,
    merchantRaw: read.merchantRaw,
    descriptionSuggested: null,
    suggestedType: 'expense',
    createdAt: receivedAt,
  }
}

/** The merchant goes in the notification only when the template knows where it sits: the whole bank text is not shown. */
function createdPayment(
  owner: string,
  recommendationId: string,
  amount: { cents: number; currency: string },
  read: Reading,
): CreatedPayment {
  return {
    owner,
    recommendationId,
    amountCents: amount.cents,
    currency: amount.currency,
    merchant: read.merchantIsSpan ? read.merchantRaw : null,
  }
}

/**
 * What a recorded push became, once `onCreated` has been told of a payment that made a recommendation of its own: only
 * that push is announced, since one that joins a recommendation tells the person nothing new. Null when nothing was
 * stored.
 */
function announced(
  recorded: CaptureRecorded,
  onCreated: ((payment: CreatedPayment) => void) | undefined,
  payment: CreatedPayment,
): StoreResult | null {
  if (!recorded) return null
  if (recorded === 'created') onCreated?.(payment)
  return recorded === 'grouped' ? 'grouped' : 'stored'
}

/**
 * Stores a push and the recommendation it becomes, in one batch, with its shape, its slots and the template it
 * belongs to. Only a push that shows an amount with a currency marker makes one, whatever its bank or words: the
 * amount is that number's first reading, the currency its marker's, and the type `expense` until the person's
 * decisions teach the template another. Any other push keeps nothing, so a one-time code never lands. A push of a
 * template the person has ignored is only counted, as an unread push of the day and a sighting of the template, so the
 * setup screen's counts stay true. A push that makes a new template is never ignored. A push of the same movement as
 * an open recommendation joins it rather than making another (`recordCapture`).
 */
export async function storePush(
  captures: CaptureRepository,
  key: CaptureKey,
  push: RawPush,
  date: PushInstant,
  secret: string,
  now: Date,
  caps: CaptureCaps,
  onCreated?: (payment: CreatedPayment) => void,
): Promise<StoreResult> {
  const body = cleanText(push.body)
  const reading = readPush(push.title, body)
  const amount = amountOf(reading)
  if (!amount) return codeLike(reading.slots) ? 'code-like' : 'no-amount'
  const receivedAt = now.toISOString()
  const read = await readForStore(captures, key.owner, push, body, reading)
  if (read.ignoredTemplate !== null) {
    await captures.countIgnoredPush(key.owner, push.source, receivedAt.slice(0, 10), read.ignoredTemplate, receivedAt)
    return 'ignored'
  }
  const hash = await hmacHex(secret, await replayKey(push))
  const lastFour = lastFourOf(reading.slots)
  const cards = lastFour ? await captures.listCards(key.owner) : []
  const card = cards.find((c) => c.source === push.source && c.digitsKind === 'card' && c.digits === lastFour)
  const event: CaptureEvent = {
    id: crypto.randomUUID(),
    keyId: key.keyId,
    source: push.source,
    replayKey: hash,
    kind: 'push',
    amountCents: amount.cents,
    currency: amount.currency,
    merchantRaw: read.merchantRaw,
    merchantIsSpan: read.merchantIsSpan,
    last4: lastFour,
    accountDigits: null,
    occurredAt: new Date(date.instantMs).toISOString(),
    localDate: date.localDate,
    offsetMinutes: date.offsetMinutes,
    receivedAt,
    shapeId: read.shapeId,
    slots: read.slots,
    body: read.body,
  }
  const paidOn = messageDate(reading.tokens, date.localDate) ?? date.localDate
  const recommendation = newRecommendation(amount, date, paidOn, read, card?.accountId ?? null, receivedAt)
  const recorded = await captures.recordCapture(event, recommendation, caps, read.decision)
  const payment = createdPayment(key.owner, recommendation.id, amount, read)
  return (
    announced(recorded, onCreated, payment) ??
    ((await captures.hasEvent(key.keyId, push.source, hash)) ? 'replay' : 'limited')
  )
}
