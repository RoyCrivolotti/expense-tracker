/**
 * The ways the rollup's triggers and backfill can be made wrong, as edits to the text of one statement of
 * migration 0039. Each is applied in a scratch database and must make the oracle fail (the test is
 * ledgerRollupMutants.integration.test.ts). `in` names the statement; `backfill` marks the edits to the two
 * INSERT OR REPLACE statements, which only matter when the tables are filled over rows that already exist.
 */
export interface Mutant {
  name: string
  in: string
  edit: (sql: string) => string
  backfill?: true
}

const AI = 'ledger_rollup_ai '
const AD = 'ledger_rollup_ad '
const CELL = 'ledger_rollup_au_cell'
const AMOUNT = 'ledger_rollup_au_amount'
const MONTH = 'ledger_rollup_au_month'

const sub = (from: RegExp | string, to = '') => (sql: string) => sql.replace(from, to)
/** The first statement of a trigger body that starts with `start`, through its semicolon, removed. */
const without = (start: string, nth = 0) => (sql: string) => {
  const found = [...sql.matchAll(new RegExp(`\\n {2}${start}[^;]*;`, 'g'))][nth]
  if (!found) throw new Error(`no statement starting ${start}`)
  return sql.replace(found[0], '')
}

/** The five terms of the pinned predicate, as they are written for a row called OLD or NEW. */
const TERMS: Record<string, RegExp> = {
  investment: /(OLD|NEW|t)\.type = 'investment' OR /g,
  plan: /OR (OLD|NEW|t)\.plan_id IS NOT NULL ?/g,
  flag: /OR (OLD|NEW|t)\.flag_id IS NOT NULL ?/g,
  settled: /OR (OLD|NEW|t)\.settled_by IS NOT NULL ?/g,
  count: /OR (OLD|NEW|t)\.report_count > 0 ?/g,
}

const pinnedTerms = (trigger: string, label: string): Mutant[] =>
  Object.entries(TERMS).map(([term, pattern]) => ({ name: `${label}: pinned ignores ${term}`, in: trigger, edit: sub(pattern) }))

const signs = (trigger: string, label: string): Mutant => ({
  name: `${label}: zero counts as positive`,
  in: trigger,
  edit: sub(/amount_cents > 0 THEN 1/g, 'amount_cents >= 0 THEN 1'),
})

/** The WHEN of the moved-cell trigger, term by term. */
const GUARD_TERMS: Array<[string, RegExp]> = [
  ['owner', /OLD\.owner IS NOT NEW\.owner OR /],
  ['month', /OR OLD\.budget_month IS NOT NEW\.budget_month\n/],
  ['account', /OR OLD\.account_id IS NOT NEW\.account_id /],
  ['category', /OR OLD\.category_id IS NOT NEW\.category_id\n/],
  ['type', /OR OLD\.type IS NOT NEW\.type /],
  ['cancelled', /OR OLD\.cancelled IS NOT NEW\.cancelled\n/],
  ['pinned', /OR \(CASE WHEN OLD\.type = 'investment'[^]*?ELSE 0 END\) <> \(CASE WHEN NEW\.type = 'investment'[^]*?ELSE 0 END\)\n/],
  ['sign', /OR \(CASE WHEN OLD\.amount_cents > 0[^]*?ELSE 0 END\) <> \(CASE WHEN NEW\.amount_cents > 0[^]*?ELSE 0 END\)\n/],
]

const COLUMNS = ['owner', 'budget_month', 'account_id', 'category_id', 'type', 'cancelled', 'amount_cents', 'plan_id', 'flag_id', 'settled_by', 'report_count']

const dropColumn = (column: string) => (sql: string) => {
  const list = /UPDATE OF ([^]*?) ON transactions/.exec(sql)![1]!
  const kept = list.split(',').map((c) => c.trim()).filter((c) => c !== column).join(', ')
  return sql.replace(list, kept)
}

export const MUTANTS: Mutant[] = [
  ...pinnedTerms(AI, 'insert'), ...pinnedTerms(AD, 'delete'), ...pinnedTerms(CELL, 'key edit'), ...pinnedTerms(AMOUNT, 'amount edit'),
  signs(AI, 'insert'), signs(AD, 'delete'), signs(CELL, 'key edit'), signs(AMOUNT, 'amount edit'),
  { name: 'insert: an existing cell is left alone', in: AI, edit: sub(/ON CONFLICT \(owner, pinned[^;]*;/, 'ON CONFLICT DO NOTHING;') },
  { name: 'insert: the amount is not added', in: AI, edit: sub('sum_cents = sum_cents + excluded.sum_cents', 'sum_cents = sum_cents') },
  { name: 'insert: the cell count is not raised', in: AI, edit: sub('excluded.sum_cents, n = n + excluded.n', 'excluded.sum_cents, n = n') },
  { name: 'insert: the month count is not raised', in: AI, edit: sub('SET n = n + excluded.n', 'SET n = n') },
  { name: 'insert: no cell', in: AI, edit: without('INSERT INTO ledger_cells') },
  { name: 'insert: no month', in: AI, edit: without('INSERT INTO ledger_months') },
  { name: 'delete: the amount is added back', in: AD, edit: sub('-OLD.amount_cents, -1', 'OLD.amount_cents, -1') },
  { name: 'delete: the cell count falls by two', in: AD, edit: sub('OLD.amount_cents, -1)', 'OLD.amount_cents, -2)') },
  { name: 'delete: an emptied cell stays', in: AD, edit: without('DELETE FROM ledger_cells') },
  { name: 'delete: the month is not lowered', in: AD, edit: without('INSERT INTO ledger_months') },
  { name: 'delete: an emptied month stays', in: AD, edit: without('DELETE FROM ledger_months') },
  { name: 'delete: no cell', in: AD, edit: without('INSERT INTO ledger_cells') },
  { name: 'key edit: the old contribution stays', in: CELL, edit: without('INSERT INTO ledger_cells', 0) },
  { name: 'key edit: an emptied cell stays', in: CELL, edit: without('DELETE FROM ledger_cells') },
  { name: 'key edit: the new contribution is missing', in: CELL, edit: without('INSERT INTO ledger_cells', 1) },
  { name: 'key edit: no guard, every edit writes', in: CELL, edit: sub(/\n {2}WHEN [^]*?\nBEGIN/, '\nBEGIN') },
  ...GUARD_TERMS.map(([term, pattern]): Mutant => ({ name: `key edit: guard ignores ${term}`, in: CELL, edit: sub(pattern) })),
  ...COLUMNS.map((column): Mutant => ({ name: `key edit: ${column} does not fire it`, in: CELL, edit: dropColumn(column) })),
  { name: 'amount edit: the old amount stays', in: AMOUNT, edit: sub('sum_cents + NEW.amount_cents - OLD.amount_cents', 'sum_cents + NEW.amount_cents') },
  { name: 'amount edit: nothing is added', in: AMOUNT, edit: sub('sum_cents + NEW.amount_cents - OLD.amount_cents', 'sum_cents') },
  { name: 'amount edit: also fires when the cell moved', in: AMOUNT, edit: sub(/AND NOT \([^]*?\)\nBEGIN/, '\nBEGIN') },
  { name: 'amount edit: also fires when the amount is the same', in: AMOUNT, edit: sub('OLD.amount_cents IS NOT NEW.amount_cents AND ') },
  { name: 'amount edit: does not fire', in: AMOUNT, edit: sub('UPDATE OF amount_cents', 'UPDATE OF notes') },
  { name: 'month edit: the old month stays', in: MONTH, edit: without('INSERT INTO ledger_months', 0) },
  { name: 'month edit: an emptied month stays', in: MONTH, edit: without('DELETE FROM ledger_months') },
  { name: 'month edit: the new month is missing', in: MONTH, edit: without('INSERT INTO ledger_months', 1) },
  { name: 'month edit: a change of month does not fire it', in: MONTH, edit: sub(/OR OLD\.budget_month IS NOT NEW\.budget_month/) },
  { name: 'month edit: a change of owner does not fire it', in: MONTH, edit: sub('OLD.owner IS NOT NEW.owner OR ') },
  { name: 'month edit: budget_month does not fire it', in: MONTH, edit: sub('UPDATE OF owner, budget_month', 'UPDATE OF owner') },
  ...Object.entries(TERMS).map(([term, pattern]): Mutant => ({ name: `backfill: pinned ignores ${term}`, in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub(pattern), backfill: true })),
  { name: 'backfill: zero counts as positive', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub(/amount_cents > 0 THEN 1/g, 'amount_cents >= 0 THEN 1'), backfill: true },
  { name: 'backfill: cells are not split by sign', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub('GROUP BY 1, 2, 3, 4, 5, 6, 7, 8', 'GROUP BY 1, 2, 3, 4, 5, 6, 7'), backfill: true },
  { name: 'backfill: cancelled rows are left out of the cells', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub('FROM transactions t', 'FROM transactions t WHERE t.cancelled = 0'), backfill: true },
  { name: 'backfill: months of two owners are merged', in: 'INSERT OR REPLACE INTO ledger_months', edit: sub('GROUP BY owner, budget_month', 'GROUP BY budget_month'), backfill: true },
  { name: 'backfill: cancelled rows are left out of the months', in: 'INSERT OR REPLACE INTO ledger_months', edit: sub(/FROM transactions\n/, 'FROM transactions WHERE cancelled = 0\n'), backfill: true },
  { name: 'backfill: cells are filled with INSERT OR IGNORE', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub('INSERT OR REPLACE', 'INSERT OR IGNORE'), backfill: true },
  { name: 'backfill: cells are filled with a plain INSERT', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub('INSERT OR REPLACE', 'INSERT'), backfill: true },
  { name: 'backfill: months are filled with INSERT OR IGNORE', in: 'INSERT OR REPLACE INTO ledger_months', edit: sub('INSERT OR REPLACE', 'INSERT OR IGNORE'), backfill: true },
  { name: 'backfill: months are filled with a plain INSERT', in: 'INSERT OR REPLACE INTO ledger_months', edit: sub('INSERT OR REPLACE', 'INSERT'), backfill: true },
  { name: 'backfill: cells that already exist are not covered', in: 'INSERT OR REPLACE INTO ledger_cells', edit: sub(/\n {4}UNION ALL[^]*?FROM ledger_cells\)/, ')'), backfill: true },
  { name: 'backfill: months that already exist are not covered', in: 'INSERT OR REPLACE INTO ledger_months', edit: sub(/\n {4}UNION ALL[^]*?FROM ledger_months\)/, ')'), backfill: true },
  { name: 'backfill: empty cells stay', in: 'DELETE FROM ledger_cells WHERE n = 0', edit: sub('n = 0', 'n = 12345'), backfill: true },
  { name: 'backfill: empty months stay', in: 'DELETE FROM ledger_months WHERE n = 0', edit: sub('n = 0', 'n = 12345'), backfill: true },
]
