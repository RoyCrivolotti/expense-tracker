import { merchantKeyOf, storedSlots, suggestFor } from '../../../src/domain/capture'
import type { MerchantRow } from '../../../src/domain/capture'
import type { Recommendation } from '../../../src/domain/ports/captureRecommendations'
import { MERCHANT_ROWS_SQL, SUGGESTION_EVENTS_SQL } from '../capture/captureSuggestionsSql'
import { toFacts, type FactsRow } from '../capture/captureLearningSql'
import { rows } from './d1CaptureSupport'

type EventRow = { rec_id: string; slots: string | null; body: string | null; known: string | null } & {
  [K in keyof FactsRow]: FactsRow[K] | null
}

interface StoredMerchantRow {
  key: string
  amount_cents: number
  description: string
  category_id: number | null
  votes: number
  last_seen: string
}

/** The person's rows for these merchant keys, grouped by key. One read, none when there are no keys. */
export async function merchantRows(
  db: D1Database,
  owner: string,
  keys: readonly string[],
): Promise<Map<string, MerchantRow[]>> {
  const byKey = new Map<string, MerchantRow[]>()
  if (keys.length === 0) return byKey
  for (const r of await rows<StoredMerchantRow>(db, MERCHANT_ROWS_SQL, owner, JSON.stringify([...new Set(keys)]))) {
    const row = {
      amountCents: r.amount_cents,
      description: r.description,
      categoryId: r.category_id,
      votes: r.votes,
      lastSeen: r.last_seen,
    }
    byKey.set(r.key, [...(byKey.get(r.key) ?? []), row])
  }
  return byKey
}

/**
 * Adds what each recommendation of a page should become (`suggestFor`) and the text of the push that made it, in two
 * reads for the whole page, run together: the pushes and their templates, and the merchants. A recommendation no push
 * made gets null for both. Each is also told whether its text is a merchant (`merchantKeyOf`) or a whole message.
 */
export async function withSuggestions(
  db: D1Database,
  owner: string,
  page: Recommendation[],
): Promise<Recommendation[]> {
  if (page.length === 0) return page
  const keyOf = new Map(page.map((r) => [r.id, merchantKeyOf(r.merchantRaw)]))
  const keys = [...keyOf.values()].filter((k): k is string => k !== null)
  const [events, merchants] = await Promise.all([
    rows<EventRow>(db, SUGGESTION_EVENTS_SQL, owner, JSON.stringify(page.map((r) => r.id))),
    merchantRows(db, owner, keys),
  ])
  const byRec = new Map(events.map((e) => [e.rec_id, e]))
  return page.map((r) => {
    const event = byRec.get(r.id)
    const key = keyOf.get(r.id) ?? null
    const named = key !== null
    if (!event) return { ...r, suggestion: null, message: null, named }
    const template = event.known === null ? null : toFacts(event as FactsRow)
    const input = {
      amountCents: r.amountCents,
      accountId: r.accountId,
      suggestedType: r.suggestedType,
      slots: storedSlots(event.slots),
    }
    return {
      ...r,
      suggestion: suggestFor(input, template, key ? (merchants.get(key) ?? []) : []),
      message: event.body,
      named,
    }
  })
}
