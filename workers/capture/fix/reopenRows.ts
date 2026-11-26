import { literal } from './sql'

/**
 * What reopening one added payment reads first: the payment, its pushes, their template with the decisions on it, the
 * person's merchant rows, and whether its expense is still there. Read-only. Five statements in this order, for
 * `wrangler d1 execute --json --command`; scripts/capture-fix.ts takes nothing but one result set per statement.
 */
export function reopenRowsSql(recId: string): string {
  const r = literal(recId)
  const ownerOf = `(SELECT owner FROM recommendations WHERE id = ${r})`
  return [
    `SELECT id, owner, state, txn_id, decided_at, local_date, occurred_at, amount_cents, merchant_raw FROM recommendations WHERE id = ${r}`,
    `SELECT id, rec_id, grouped, source, local_date, shape_id, slots, template_id, body, merchant_raw, body_excerpt, outcome FROM capture_events WHERE owner = ${ownerOf} AND rec_id = ${r}`,
    `SELECT t.template_id, t.title, t.skeleton, t.merchant_start, t.merchant_end, t.accepts, t.dismissals, t.dismiss_streak, t.amount_slot, t.amount_mark, t.type, t.account_id, t.ignored_at, (SELECT COUNT(*) FROM capture_events o WHERE o.owner = t.owner AND o.template_id = t.template_id AND o.outcome IS NOT NULL AND o.rec_id <> ${r}) AS other_decided FROM capture_templates t WHERE t.owner = ${ownerOf} AND t.template_id IN (SELECT template_id FROM capture_events WHERE rec_id = ${r})`,
    // Every row, not only those of the decision's moment: the name's key is worked out in code, and a row of that name
    // bumped since must be seen. A person holds at most 2,000.
    `SELECT key, amount_cents, description, category_id, type, account_id, votes, last_seen FROM capture_merchants WHERE owner = ${ownerOf} ORDER BY key, amount_cents, description`,
    `SELECT COUNT(*) AS n FROM transactions WHERE id = (SELECT txn_id FROM recommendations WHERE id = ${r})`,
  ].join(';\n')
}

export interface ReopenRec {
  id: string
  owner: string
  state: string
  txn_id: number | null
  decided_at: string | null
  local_date: string
  occurred_at: string
  amount_cents: number | null
  merchant_raw: string | null
}

export interface ReopenEvent {
  id: string
  rec_id: string
  grouped: number
  source: string
  local_date: string
  shape_id: string | null
  slots: string | null
  template_id: string | null
  body: string | null
  merchant_raw: string | null
  body_excerpt: string | null
  outcome: string | null
}

/** The template's facts a decision writes, as stored. */
export interface TemplateFacts {
  accepts: number
  dismissals: number
  dismiss_streak: number
  amount_slot: number | null
  amount_mark: string | null
  type: string | null
  account_id: number | null
  ignored_at: string | null
}

export interface ReopenTemplate extends TemplateFacts {
  template_id: string
  title: string
  skeleton: string
  merchant_start: number | null
  merchant_end: number | null
  /** Pushes of the template, other than this payment's, that someone decided. */
  other_decided: number
}

export interface MerchantRow {
  key: string
  amount_cents: number
  description: string
  category_id: number | null
  type: string | null
  account_id: number | null
  votes: number
  last_seen: string
}

/** The five result sets of `reopenRowsSql`. */
export interface ReopenInput {
  recs: ReopenRec[]
  events: ReopenEvent[]
  templates: ReopenTemplate[]
  merchants: MerchantRow[]
  /** How many transactions hold the payment's expense id: 0 once it is deleted. */
  transactions: number
}

/** The facts of a template no one has decided a push of. */
export const UNDECIDED_FACTS: TemplateFacts = {
  accepts: 0,
  dismissals: 0,
  dismiss_streak: 0,
  amount_slot: null,
  amount_mark: null,
  type: null,
  account_id: null,
  ignored_at: null,
}
