import { addedMerchantRows, reopenGate } from './reopenGate'
import type { PushText, Refusal, Restored } from './reopenGate'
import { UNDECIDED_FACTS } from './reopenRows'
import type { MerchantRow, ReopenEvent, ReopenInput, ReopenRec, ReopenTemplate, TemplateFacts } from './reopenRows'
import { allEqual, assignments, literal, sqlFile } from './sql'
import type { SqlValue } from './sql'

/**
 * Puts a payment that was added and whose expense was then deleted back on the review list, as the current capture
 * Worker would have stored it: open, dated by the day its words name, with its words, and with what the add taught the
 * app taken back (the template's facts and the merchant rows the add inserted). The app has no way to do this: deleting
 * the expense leaves the payment decided and pointing at nothing.
 *
 * Every statement is guarded by the values read in the dry run and by the payment still being as the add left it, so a
 * plan that has gone stale changes nothing. Each is expected to change one row; when one does not, the record says to
 * run the undo, which puts back exactly what the apply wrote, and nothing once the payment has been answered again.
 * Clearing the push's outcome without taking back what the add taught would let the next add teach it twice, so the
 * payment is reopened only after both, and the undo takes back whichever happened.
 */

export interface ReopenPlan {
  recId: string
  from: string
  to: string
  /** `changes` each statement of `apply` must report, in order. */
  expectedChanges: number[]
  apply: string
  undo: string
}

export type ReopenResult = { ok: true; plan: ReopenPlan } | { ok: false; refusals: Refusal[] }

const FACT_COLUMNS = (f: TemplateFacts) => ({
  accepts: f.accepts,
  dismissals: f.dismissals,
  dismiss_streak: f.dismiss_streak,
  amount_slot: f.amount_slot,
  amount_mark: f.amount_mark,
  type: f.type,
  account_id: f.account_id,
  ignored_at: f.ignored_at,
})

const merchantColumns = (m: MerchantRow) => ({
  key: m.key,
  amount_cents: m.amount_cents,
  description: m.description,
  category_id: m.category_id,
  type: m.type,
  account_id: m.account_id,
  votes: m.votes,
  last_seen: m.last_seen,
})

/** The rows each statement touches, the values they hold before and after, and the conditions the guards use. */
function partsOf(
  rec: ReopenRec,
  event: ReopenEvent,
  template: ReopenTemplate,
  restored: Restored,
) {
  const owner = { owner: rec.owner }
  const recRow = { ...owner, id: rec.id }
  const added = { state: 'submitted', txn_id: rec.txn_id, decided_at: rec.decided_at, local_date: rec.local_date }
  const eventRow = { ...owner, id: event.id, rec_id: rec.id }
  const written = { body: restored.body, merchant_raw: restored.merchantRaw, outcome: null }
  const templateRow = { ...owner, template_id: template.template_id }
  const undecided = FACT_COLUMNS(UNDECIDED_FACTS)
  const exists = (
    table: string,
    columns: Record<string, SqlValue>,
  ) => `EXISTS (SELECT 1 FROM ${table} WHERE ${allEqual(columns)})`
  return {
    owner,
    recRow,
    added,
    reopened: { state: 'open', txn_id: null, decided_at: null, local_date: restored.localDate },
    eventRow,
    blank: { body: null, merchant_raw: null, outcome: event.outcome },
    written,
    templateRow,
    learned: FACT_COLUMNS(template),
    undecided,
    /** The payment as the add left it: the guard that keeps every statement but the reopen off a payment answered since. */
    stillAdded: exists('recommendations', { ...recRow, ...added }),
    expenseGone: `NOT EXISTS (SELECT 1 FROM transactions WHERE id = ${literal(rec.txn_id)})`,
    eventWritten: exists('capture_events', { ...eventRow, ...written }),
    templateReset: exists('capture_templates', { ...templateRow, ...undecided }),
    noDecision: `NOT EXISTS (SELECT 1 FROM capture_events WHERE ${allEqual(templateRow)} AND outcome IS NOT NULL)`,
  }
}

type Parts = ReturnType<typeof partsOf>

const sameMerchant = (
  p: Parts,
  m: MerchantRow,
) => allEqual({ ...p.owner, key: m.key, amount_cents: m.amount_cents, description: m.description })

/**
 * The push's words and outcome first, then the template's facts (which needs that outcome cleared), then the merchant
 * rows, and the payment's reopening last, only once all of them happened. A statement that finds its row changed changes
 * nothing, and so does every one after it, so the payment never shows on the list half restored.
 */
function applyStatements(
  p: Parts,
  merchants: readonly MerchantRow[],
): string[] {
  const merchantsGone = merchants.map(
    (m) => ` AND NOT EXISTS (SELECT 1 FROM capture_merchants WHERE ${sameMerchant(p, m)})`,
  )
  return [
    `UPDATE capture_events SET ${assignments(p.written)} WHERE ${allEqual({ ...p.eventRow, ...p.blank })} AND ${p.stillAdded} AND ${p.expenseGone}`,
    `UPDATE capture_templates SET ${assignments(p.undecided)} WHERE ${allEqual({ ...p.templateRow, ...p.learned })} AND ${p.noDecision} AND ${p.stillAdded} AND ${p.eventWritten}`,
    ...merchants.map(
      (m) =>
        `DELETE FROM capture_merchants WHERE ${allEqual({ ...p.owner, ...merchantColumns(m) })} AND ${p.stillAdded} AND ${p.eventWritten} AND ${p.templateReset}`,
    ),
    `UPDATE recommendations SET ${assignments(p.reopened)} WHERE ${allEqual({ ...p.recRow, ...p.added })} AND ${p.expenseGone} AND ${p.eventWritten} AND ${p.templateReset}${merchantsGone.join('')}`,
  ]
}

/**
 * The apply backwards. The payment goes back to added first, and every later statement runs only while it is still as
 * the add left it, so an undo run after the reopened payment was added again or dismissed changes nothing at all.
 */
function undoStatements(
  p: Parts,
  merchants: readonly MerchantRow[],
): string[] {
  return [
    `UPDATE recommendations SET ${assignments(p.added)} WHERE ${allEqual({ ...p.recRow, ...p.reopened })}`,
    ...merchants.map((m) => {
      const row = { ...p.owner, ...merchantColumns(m) }
      const values = Object.values(row).map(literal).join(', ')
      return `INSERT INTO capture_merchants (${Object.keys(row).join(', ')}) SELECT ${values} WHERE NOT EXISTS (SELECT 1 FROM capture_merchants WHERE ${sameMerchant(p, m)}) AND ${p.stillAdded} AND ${p.eventWritten}`
    }),
    `UPDATE capture_templates SET ${assignments(p.learned)} WHERE ${allEqual({ ...p.templateRow, ...p.undecided })} AND ${p.stillAdded} AND ${p.eventWritten}`,
    `UPDATE capture_events SET ${assignments(p.blank)} WHERE ${allEqual({ ...p.eventRow, ...p.written })} AND ${p.stillAdded}`,
  ]
}

/** Plans the reopening from the rows of `reopenRowsSql` and the push's words, or says every reason it will not. */
export async function planReopen(
  input: ReopenInput,
  text: PushText,
): Promise<ReopenResult> {
  const { refusals, restored } = await reopenGate(input, text)
  const rec = input.recs[0]
  const event = input.events[0]
  const template = input.templates.find((t) => t.template_id === event?.template_id)
  if (refusals.length > 0 || !restored || !rec || !event || !template) return { ok: false, refusals }
  const parts = partsOf(rec, event, template, restored)
  const merchants = addedMerchantRows(rec, input.merchants)
  const apply = applyStatements(parts, merchants)
  const undo = undoStatements(parts, merchants)
  return {
    ok: true,
    plan: {
      recId: rec.id,
      from: rec.local_date,
      to: restored.localDate,
      expectedChanges: apply.map(() => 1),
      apply: sqlFile(apply),
      undo: sqlFile(undo),
    },
  }
}
