import { merchantKeyOf } from '../../../src/domain/capture/merchants'
import { messageDate } from '../../../src/domain/capture/messageDate'
import { readPush, spanText } from '../../../src/domain/capture/readPush'
import { shapeId } from '../../../src/domain/capture/shape'
import { cleanText } from '../../../src/domain/capture/text'
import { MAX_BODY, MAX_MERCHANT, slotsJson } from '../src/storedText'
import { matchTemplate } from '../src/templates'
import type { MerchantRow, ReopenEvent, ReopenInput, ReopenRec, ReopenTemplate } from './reopenRows'

/** The push's words as the phone sent them: its title and its body. */
export interface PushText {
  title: string
  body: string
}

/** What the current Worker would have stored from the words: the text, the name and the payment's day. */
export interface Restored {
  body: string
  merchantRaw: string | null
  localDate: string
}

/**
 * Why a payment cannot be reopened. Each is checked whatever the others say, so one run lists them all.
 * `not-added`: it is not an added payment. `expense-exists`: its expense is still there, so reopening it would offer a
 * payment already entered. `not-one-push`: it has no push or several. `not-blank` / `no-outcome`: its push does not
 * look like one an add blanked and learned from. `no-template`: no template to reset. `template-decided-elsewhere`: the
 * template's facts hold another decision, so they cannot be put back to the defaults. `shape-differs`, `slots-differ`,
 * `title-differs`, `name-differs`: the words given are not the words the Worker read. `no-date`: the words name no day.
 * `merchant-not-from-this-add`: the merchant rows hold more than this add's votes, or lack them (`merchantsFromThisAdd`).
 */
export type Refusal =
  | 'not-added'
  | 'expense-exists'
  | 'not-one-push'
  | 'not-blank'
  | 'no-outcome'
  | 'no-template'
  | 'template-decided-elsewhere'
  | 'shape-differs'
  | 'slots-differ'
  | 'title-differs'
  | 'name-differs'
  | 'no-date'
  | 'merchant-not-from-this-add'

/** Whether the push looks like one an add blanked and learned from: no text left, and an outcome recorded. */
function eventRefusals(
  input: ReopenInput,
  event: ReopenEvent | undefined,
): Refusal[] {
  if (!event || input.events.length !== 1 || event.grouped !== 0) return ['not-one-push']
  const refusals: Refusal[] = []
  if (event.body !== null || event.merchant_raw !== null || event.body_excerpt !== null) refusals.push('not-blank')
  if (event.outcome === null) refusals.push('no-outcome')
  return refusals
}

/** The checks on the rows alone, before any words are read. */
function rowRefusals(
  rec: ReopenRec,
  input: ReopenInput,
  event: ReopenEvent | undefined,
  template: ReopenTemplate | undefined,
): Refusal[] {
  const refusals: Refusal[] = []
  if (rec.state !== 'submitted' || rec.txn_id === null || rec.decided_at === null) refusals.push('not-added')
  if (input.transactions !== 0) refusals.push('expense-exists')
  refusals.push(...eventRefusals(input, event))
  if (!template) refusals.push('no-template')
  else if (template.other_decided !== 0) refusals.push('template-decided-elsewhere')
  if (!merchantsFromThisAdd(rec, input.merchants)) refusals.push('merchant-not-from-this-add')
  return refusals
}

/**
 * The merchant rows the add inserted: those of the payment's name written at the moment it was decided. A vote at that
 * moment inserts a row with one vote, or bumps one that was there before.
 */
export function addedMerchantRows(
  rec: ReopenRec,
  merchants: readonly MerchantRow[],
): MerchantRow[] {
  const key = merchantKeyOf(rec.merchant_raw)
  return merchants.filter((m) => m.key === key && m.last_seen === rec.decided_at)
}

/**
 * Whether the merchant rows show this add's votes and nothing else: every row written at the decision's moment is of
 * the payment's name and has the one vote the add gave it, no row of that name was written after it (a later add would
 * have voted on top, and deleting the row would take that vote too), and a payment with a name has its rows, since an
 * add with a description always votes for it.
 */
function merchantsFromThisAdd(
  rec: ReopenRec,
  merchants: readonly MerchantRow[],
): boolean {
  const key = merchantKeyOf(rec.merchant_raw)
  const at = rec.decided_at ?? ''
  const atDecision = merchants.filter((m) => m.last_seen === at)
  if (atDecision.some((m) => m.key !== key || m.votes !== 1)) return false
  if (merchants.some((m) => m.key === key && m.last_seen > at)) return false
  return key === null || atDecision.length > 0
}

/** Reads the words as the current Worker would and checks they are the words it stored for this push. */
async function wordRefusals(
  text: PushText,
  rec: ReopenRec,
  event: ReopenEvent,
  template: ReopenTemplate,
): Promise<{ refusals: Refusal[]; restored: Restored | null }> {
  const body = cleanText(text.body)
  const reading = readPush(text.title, body)
  const refusals: Refusal[] = []
  if ((await shapeId(event.source, reading.skeleton)) !== event.shape_id) refusals.push('shape-differs')
  if (slotsJson(reading.slots) !== event.slots) refusals.push('slots-differ')
  if (reading.titleSkeleton !== template.title) refusals.push('title-differs')
  const known = {
    templateId: template.template_id,
    skeleton: template.skeleton,
    merchantStart: template.merchant_start,
    merchantEnd: template.merchant_end,
    ignoredAt: template.ignored_at,
  }
  const run = matchTemplate([known], reading.skeletonTokens)?.merchant
  const name = (run ? spanText(reading, run) : '') || body
  const merchantRaw = name === '' ? null : name.slice(0, MAX_MERCHANT)
  if (merchantRaw !== rec.merchant_raw) refusals.push('name-differs')
  const localDate = messageDate(reading.tokens, event.local_date)
  if (localDate === null) refusals.push('no-date')
  const restored = localDate === null ? null : { body: body.slice(0, MAX_BODY), merchantRaw, localDate }
  return { refusals, restored }
}

/** Every reason the payment cannot be reopened with these words, and what it becomes when there is none. */
export async function reopenGate(
  input: ReopenInput,
  text: PushText,
): Promise<{ refusals: Refusal[]; restored: Restored | null }> {
  const rec = input.recs[0]
  if (!rec) return { refusals: ['not-added'], restored: null }
  const event = input.events[0]
  const template = input.templates.find((t) => t.template_id === event?.template_id)
  const refusals = rowRefusals(rec, input, event, template)
  if (!event || !template) return { refusals, restored: null }
  const words = await wordRefusals(text, rec, event, template)
  const all = [...refusals, ...words.refusals]
  return { refusals: all, restored: all.length === 0 ? words.restored : null }
}
