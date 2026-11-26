import { messageDate } from '../../../src/domain/capture/messageDate'
import { readPush } from '../../../src/domain/capture/readPush'
import { MAX_BODY } from '../src/storedText'
import { allEqual, assignments, sqlFile } from './sql'

/**
 * Re-dates waiting payments stored before the capture Worker read the day a bank's message names. It runs the Worker's
 * own reading over the message text kept with each payment and plans one guarded UPDATE for each payment it would have
 * dated differently, and the UPDATE that takes it back. It writes nothing itself.
 *
 * Only `local_date` moves. `occurred_at` keeps the arrival, which is what tells the app a payment was announced ahead.
 */

/** Every payment with each of its pushes, the first push first. Read-only; the planner decides which rows qualify. */
export const REDATE_ROWS_SQL = `SELECT r.id, r.owner, r.state, r.local_date, r.occurred_at, r.amount_cents,
e.grouped, e.local_date AS arrival, e.received_at, e.body, e.slots
FROM recommendations r LEFT JOIN capture_events e ON e.owner = r.owner AND e.rec_id = r.id
ORDER BY r.id, e.received_at`

/** One row of `REDATE_ROWS_SQL`: a payment and one of its pushes, or a payment with no push. */
export interface RedateRow {
  id: string
  owner: string
  state: string
  local_date: string
  occurred_at: string
  amount_cents: number | null
  grouped: number | null
  /** The phone's own day the push arrived on. */
  arrival: string | null
  /** When the server received it, in UTC. Never the day used: that is the phone's. */
  received_at: string | null
  body: string | null
  slots: string | null
}

/**
 * Why a payment is or is not re-dated. `decided`: added, linked or dismissed (and its text blanked). `no-first-push`:
 * no push of its own. `no-text`: the text is gone. `cut`: the text was cut at the column's length, so a second date may
 * have been lost. `already-dated`: its day is not its arrival day, so a Worker that reads dates stored it. `no-date`:
 * the text names no other single day. `needs-a-look`: the text names a day that a date the push held elsewhere (its
 * title, or past the cut) does not agree with. `redate`: moved.
 */
export type RedateVerdict =
  'redate' | 'decided' | 'no-first-push' | 'no-text' | 'cut' | 'already-dated' | 'no-date' | 'needs-a-look'

/** What the record files keep of a payment: its id, amount, days and verdict. Never any of its text. */
export interface RedateEntry {
  id: string
  amountCents: number | null
  verdict: RedateVerdict
  from: string
  to: string | null
}

export interface RedatePlan {
  entries: RedateEntry[]
  apply: string
  undo: string
}

/** The dates among a push's stored slots, or null when the slots cannot be read. */
function slotDates(slots: string | null): string[] | null {
  if (slots === null) return []
  try {
    const parsed = JSON.parse(slots) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.flatMap((s: { kind?: unknown; iso?: unknown }) =>
      s.kind === 'date' && typeof s.iso === 'string' ? [s.iso] : [],
    )
  } catch {
    return null
  }
}

/** The verdict for one payment from its rows, and the day it moves to when it does. */
function judge(rows: readonly RedateRow[]): { verdict: RedateVerdict; to: string | null } {
  const rec = rows[0]!
  if (rec.state !== 'open') return { verdict: 'decided', to: null }
  const first = rows.find((r) => r.grouped === 0)
  if (!first || first.arrival === null) return { verdict: 'no-first-push', to: null }
  if (first.body === null) return { verdict: 'no-text', to: null }
  if (first.body.length >= MAX_BODY) return { verdict: 'cut', to: null }
  if (rec.local_date !== first.arrival) return { verdict: 'already-dated', to: null }
  const named = messageDate(readPush('', first.body).tokens, first.arrival)
  if (named === null || named === rec.local_date) return { verdict: 'no-date', to: null }
  const dates = slotDates(first.slots)
  if (dates === null || dates.some((d) => d !== named)) return { verdict: 'needs-a-look', to: null }
  return { verdict: 'redate', to: named }
}

/** The UPDATE that moves one payment from one day to another, changing nothing when the row is not as planned. */
function move(
  rec: RedateRow,
  from: string,
  to: string,
): string {
  const guard = allEqual({
    owner: rec.owner,
    id: rec.id,
    state: 'open',
    local_date: from,
    occurred_at: rec.occurred_at,
  })
  return `UPDATE recommendations SET ${assignments({ local_date: to })} WHERE ${guard}`
}

/** Plans the re-dating from the rows of `REDATE_ROWS_SQL`. */
export function planRedate(rows: readonly RedateRow[]): RedatePlan {
  const byId = new Map<string, RedateRow[]>()
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row])
  const entries: RedateEntry[] = []
  const apply: string[] = []
  const undo: string[] = []
  for (const group of byId.values()) {
    const rec = group[0]!
    const { verdict, to } = judge(group)
    entries.push({ id: rec.id, amountCents: rec.amount_cents, verdict, from: rec.local_date, to })
    if (to === null) continue
    apply.push(move(rec, rec.local_date, to))
    undo.push(move(rec, to, rec.local_date))
  }
  return { entries, apply: sqlFile(apply), undo: sqlFile(undo) }
}
